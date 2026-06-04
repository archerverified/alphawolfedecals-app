'use client';

// Top-level client editor (ADR-0006). Owns the document store + UndoStack, the
// tool rail, undo/redo (Cmd+Z / Cmd+Shift+Z), snap settings, the upload panel,
// autosave wiring, and the loading/empty states. Lays out left rail · canvas ·
// right inspector in the zinc visual language.
//
// This is the ssr:false boundary's payload (EditorMount mounts it dynamically),
// so it is the first place Konva is allowed to exist.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Type,
  Square,
  Circle,
  Minus,
  Image as ImageIcon,
  Undo2,
  Redo2,
  MousePointer2,
  Magnet,
  Check,
  Loader2,
  Save,
} from 'lucide-react';
import { Button } from '@alphawolf/ui/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@alphawolf/ui/components/ui/card';
import { Skeleton } from '@alphawolf/ui/components/ui/skeleton';
import { Separator } from '@alphawolf/ui/components/ui/separator';
import { Switch } from '@alphawolf/ui/components/ui/switch';
import { Slider } from '@alphawolf/ui/components/ui/slider';
import { Label } from '@alphawolf/ui/components/ui/label';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from '@alphawolf/ui/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@alphawolf/ui/components/ui/popover';
import { factory, deserializeDocument, geometry } from '@alphawolf/canvas';
import type {
  CanvasDocument,
  CanvasElement,
  ElementId,
  history,
  ImageElement,
  PanelId,
  PanelState,
  VehicleView,
} from '@alphawolf/canvas';

type Command = history.Command;
type ElementPatch = history.ElementPatch;
import type { EditorProps } from './contract';
import type { ShapeKind, SnapSettings, Tool } from './types';
import { useEditorStore } from './useEditorStore';
import { useAutosave } from './useAutosave';
import { usePanelClips } from './useKonvaClip';
import { CanvasStage } from './CanvasStage';
import { UploadPanel } from './UploadPanel';
import { ColorField } from './ColorField';
import { capture } from '@/lib/analytics';

const IS_PROD = process.env.NODE_ENV === 'production';

/** Ensure every vehicle panel has a PanelState so commands can target it. */
function normalizeDocument(
  raw: Record<string, unknown>,
  vehicleId: string,
  panels: EditorProps['vehicle']['panels'],
): CanvasDocument {
  let base: CanvasDocument;
  if (raw && Object.keys(raw).length > 0) {
    try {
      base = deserializeDocument(raw).document;
    } catch {
      base = factory.newDocument(vehicleId);
    }
  } else {
    base = factory.newDocument(vehicleId);
  }
  const nextPanels: Record<string, PanelState> = { ...base.panels };
  for (const p of panels) {
    if (!nextPanels[p.id]) {
      nextPanels[p.id] = {
        panelId: p.id as PanelId,
        view: p.view as VehicleView,
        elementIds: [],
      };
    }
  }
  return { ...base, panels: nextPanels };
}

/** Seed N elements across panels for the fps benchmark (?perfSeed=N, non-prod). */
function seedPerf(
  doc: CanvasDocument,
  n: number,
  panels: EditorProps['vehicle']['panels'],
): CanvasDocument {
  if (n <= 0 || panels.length === 0) return doc;
  let next = doc;
  let seq = doc.seq;
  const elements: Record<string, CanvasElement> = { ...doc.elements };
  const panelStates: Record<string, PanelState> = { ...doc.panels };
  for (let i = 0; i < n; i++) {
    const panel = panels[i % panels.length]!;
    const id = factory.elementId(`perf-${i}`);
    const init = { id, panelId: panel.id as PanelId, view: panel.view as VehicleView };
    const x = 200 + (i % 5) * 300;
    const y = 200 + Math.floor(i / 5) * 200;
    const el: CanvasElement =
      i % 2 === 0
        ? factory.newText(init, { x, y, content: `T${i}` })
        : factory.newRect(init, { x, y, width: 240, height: 160, fill: '#71717a' });
    elements[id] = el;
    const ps = panelStates[panel.id];
    if (ps) panelStates[panel.id] = { ...ps, elementIds: [...ps.elementIds, id] };
    seq = Math.max(seq, i + 1);
  }
  // Select the first seeded element so it carries the `perf-drag-target` Konva
  // name (the Playwright drag test targets it to sample rAF deltas).
  const firstId = factory.elementId('perf-0');
  next = { ...next, elements, panels: panelStates, seq, selection: [firstId] };
  return next;
}

export default function CanvasEditor(props: EditorProps) {
  const { projectId, versionId, initialRev, vehicle, initialDocument } = props;

  // Read ?perfSeed=N once (non-prod only).
  const perfSeed = useMemo(() => {
    if (IS_PROD || typeof window === 'undefined') return 0;
    const n = Number(new URLSearchParams(window.location.search).get('perfSeed'));
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  }, []);

  const initialDoc = useMemo(() => {
    const doc = normalizeDocument(initialDocument, vehicle.id, vehicle.panels);
    return perfSeed > 0 ? seedPerf(doc, perfSeed, vehicle.panels) : doc;
  }, [initialDocument, vehicle.id, vehicle.panels, perfSeed]);

  const store = useEditorStore(initialDoc);
  const { doc, dispatch, undo, redo, select, canUndo, canRedo } = store;

  const autosave = useAutosave({ projectId, versionId, initialRev, doc });

  const clips = usePanelClips(
    useMemo(
      () => vehicle.panels.map((p) => ({ id: p.id, wrapSafePath: p.wrapSafePath })),
      [vehicle.panels],
    ),
  );

  const [tool, setTool] = useState<Tool>('select');
  const [shapeKind, setShapeKind] = useState<ShapeKind>('rect');
  const [snap, setSnap] = useState<SnapSettings>({ enabled: true, thresholdPx: 8 });
  // Mirrors the Konva out-of-bounds cue into a DOM aria-live region (a11y).
  const [cueVisible, setCueVisible] = useState(false);

  // Mount + viewport sizing.
  const [mounted, setMounted] = useState(false);
  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });

  useEffect(() => {
    setMounted(true);
    // Analytics: editor session started (best-effort, env-gated no-op in CI/local).
    capture('editor_opened', { projectId, vehicleId: vehicle.id });
    const host = canvasHostRef.current;
    if (!host) return;
    const update = () => setSize({ width: host.clientWidth, height: host.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(host);
    return () => ro.disconnect();
  }, []);

  // Keyboard: Cmd/Ctrl+Z undo, Cmd/Ctrl+Shift+Z (or Ctrl+Y) redo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((k === 'z' && e.shiftKey) || k === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  const selectedId = doc.selection[0];
  const selectedEl = selectedId ? doc.elements[selectedId] : undefined;

  // The target panel for new elements: the selected element's panel, else the
  // first panel of the vehicle.
  const targetPanel = useMemo<{ id: PanelId; view: VehicleView } | null>(() => {
    if (selectedEl) return { id: selectedEl.panelId, view: selectedEl.view };
    const first = vehicle.panels[0];
    return first ? { id: first.id as PanelId, view: first.view as VehicleView } : null;
  }, [selectedEl, vehicle.panels]);

  const mintId = useCallback(() => `el-${doc.seq + 1}-${Date.now().toString(36)}`, [doc.seq]);

  const addElement = useCallback(
    (el: CanvasElement) => {
      const panel = doc.panels[el.panelId];
      const index = panel ? panel.elementIds.length : 0;
      dispatch({ kind: 'addElement', element: el, index });
      select([el.id]);
    },
    [doc.panels, dispatch, select],
  );

  // Where a freshly-added element lands: the centre of the target panel's
  // wrap-safe area, cascaded by ~40px per existing element so repeated "Add"
  // clicks fan out instead of stacking on top of each other.
  const placementFor = useCallback(() => {
    if (!targetPanel) return { x: 400, y: 400 };
    let cx = 400;
    let cy = 400;
    const clip = clips[targetPanel.id];
    if (clip && clip.rings.length > 0) {
      const b = geometry.bbox(clip.rings);
      cx = (b.minX + b.maxX) / 2;
      cy = (b.minY + b.maxY) / 2;
    }
    const ps = doc.panels[targetPanel.id];
    const offset = ((ps ? ps.elementIds.length : 0) % 6) * 40;
    return { x: cx + offset, y: cy + offset };
  }, [targetPanel, clips, doc.panels]);

  const addText = useCallback(() => {
    if (!targetPanel) return;
    const { x, y } = placementFor();
    addElement(
      factory.newText(
        { id: factory.elementId(mintId()), panelId: targetPanel.id, view: targetPanel.view },
        { x, y, content: 'Double-click to edit' },
      ),
    );
  }, [targetPanel, addElement, mintId, placementFor]);

  const addShape = useCallback(() => {
    if (!targetPanel) return;
    const init = {
      id: factory.elementId(mintId()),
      panelId: targetPanel.id,
      view: targetPanel.view,
    };
    const { x, y } = placementFor();
    const el =
      shapeKind === 'ellipse'
        ? factory.newEllipse(init, { x, y })
        : shapeKind === 'line'
          ? factory.newLine(init, { x, y })
          : factory.newRect(init, { x, y });
    addElement(el);
  }, [targetPanel, shapeKind, addElement, mintId, placementFor]);

  const onPlaceImage = useCallback(
    (el: ImageElement) => {
      addElement(el);
      // Analytics: artwork placed onto a panel (best-effort, env-gated no-op).
      capture('asset_placed', { projectId, assetId: el.assetId });
    },
    [addElement, projectId],
  );

  const onSelect = useCallback(
    (id: ElementId) => {
      if (!id) select([]);
      else select([id]);
    },
    [select],
  );

  const onCommit = useCallback((cmd: Command) => dispatch(cmd), [dispatch]);

  const deleteSelected = useCallback(() => {
    const ids = doc.selection;
    if (ids.length === 0) return;
    const elements: CanvasElement[] = [];
    const panelIds: PanelId[] = [];
    const indices: number[] = [];
    for (const id of ids) {
      const el = doc.elements[id];
      if (!el) continue;
      const panel = doc.panels[el.panelId];
      const idx = panel ? panel.elementIds.indexOf(id) : 0;
      elements.push(el);
      panelIds.push(el.panelId);
      indices.push(idx);
    }
    if (elements.length > 0) {
      dispatch({ kind: 'removeElements', elements, panelIds, indices });
    }
  }, [doc.selection, doc.elements, doc.panels, dispatch]);

  // Nudge the selection by (dx, dy) canvas units as one undoable Command.
  const translateSelected = useCallback(
    (dx: number, dy: number) => {
      const ids = doc.selection;
      if (ids.length === 0) return;
      const before: { id: ElementId; x: number; y: number }[] = [];
      const after: { id: ElementId; x: number; y: number }[] = [];
      for (const id of ids) {
        const el = doc.elements[id];
        if (!el) continue;
        before.push({ id, x: el.x, y: el.y });
        after.push({ id, x: el.x + dx, y: el.y + dy });
      }
      if (after.length > 0) dispatch({ kind: 'updateElements', before, after });
    },
    [doc.selection, doc.elements, dispatch],
  );

  // Recolor the selected element's fill (text + shape) or stroke (shape) as one
  // undoable Command. fill/stroke are type-specific and not on the common
  // ElementPatch shape, so we widen the {id,[prop]} literal — applyCommand spreads
  // it onto the live element, which already carries the field (ADR-0006 §3).
  const updateSelectedColor = useCallback(
    (prop: 'fill' | 'stroke', next: string | null) => {
      const id = doc.selection[0];
      const el = id ? doc.elements[id] : undefined;
      if (!el) return;
      const prev = (el as { fill?: string | null; stroke?: string | null })[prop] ?? null;
      if (prev === next) return;
      const before = { id: el.id, [prop]: prev } as ElementPatch;
      const after = { id: el.id, [prop]: next } as ElementPatch;
      dispatch({ kind: 'updateElements', before: [before], after: [after] });
    },
    [doc.selection, doc.elements, dispatch],
  );

  // Tab / Shift+Tab moves the selection through the active panel in z-order.
  const cycleSelection = useCallback(
    (dir: 1 | -1) => {
      if (!targetPanel) return;
      const ps = doc.panels[targetPanel.id];
      if (!ps || ps.elementIds.length === 0) return;
      const ids = ps.elementIds;
      const cur = doc.selection[0];
      let idx = cur ? ids.indexOf(cur) : -1;
      idx = idx === -1 ? (dir === 1 ? 0 : ids.length - 1) : (idx + dir + ids.length) % ids.length;
      const next = ids[idx];
      if (next) select([next]);
    },
    [targetPanel, doc.panels, doc.selection, select],
  );

  // Keyboard handling for the focusable canvas host (a11y: full mouse-free use).
  // Delete/Backspace and undo/redo stay on the window listeners below; here we
  // own Tab cycling, arrow-nudge, and select-all so they don't fire page-wide.
  const handleCanvasKey = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        if (targetPanel) {
          const ps = doc.panels[targetPanel.id];
          if (ps && ps.elementIds.length > 0) select(ps.elementIds);
        }
        return;
      }
      if (meta) return; // undo/redo (z/y) are handled by the window listener.
      if (e.key === 'Tab') {
        e.preventDefault();
        cycleSelection(e.shiftKey ? -1 : 1);
        return;
      }
      const step = e.shiftKey ? 10 : 1;
      let dx = 0;
      let dy = 0;
      if (e.key === 'ArrowLeft') dx = -step;
      else if (e.key === 'ArrowRight') dx = step;
      else if (e.key === 'ArrowUp') dy = -step;
      else if (e.key === 'ArrowDown') dy = step;
      if (dx !== 0 || dy !== 0) {
        e.preventDefault();
        translateSelected(dx, dy);
      }
    },
    [targetPanel, doc.panels, select, cycleSelection, translateSelected],
  );

  // Delete / Backspace removes the selection.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && doc.selection.length > 0) {
        e.preventDefault();
        deleteSelected();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [deleteSelected, doc.selection.length]);

  const elementCount = Object.keys(doc.elements).length;

  if (!mounted) {
    return (
      <div
        className="flex h-screen w-full items-center justify-center bg-zinc-100"
        data-testid="editor-root"
      >
        <div className="flex flex-col gap-3">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-[480px] w-[720px]" />
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div
        data-testid="editor-root"
        className="flex h-screen w-full flex-col bg-zinc-100 text-zinc-900"
      >
        {/* Top bar */}
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-zinc-900">{vehicle.label}</span>
          </div>
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  data-testid="undo"
                  size="icon"
                  variant="ghost"
                  disabled={!canUndo}
                  onClick={undo}
                  aria-label="Undo"
                >
                  <Undo2 className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Undo (⌘Z)</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  data-testid="redo"
                  size="icon"
                  variant="ghost"
                  disabled={!canRedo}
                  onClick={redo}
                  aria-label="Redo"
                >
                  <Redo2 className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Redo (⌘⇧Z)</TooltipContent>
            </Tooltip>

            <Separator orientation="vertical" className="mx-1 h-6" />

            <Popover>
              <PopoverTrigger asChild>
                <Button size="sm" variant="ghost" className="gap-1.5">
                  <Magnet className="size-4" /> Snap
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-60">
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="snap-on" className="text-sm">
                      Enable snapping
                    </Label>
                    <Switch
                      id="snap-on"
                      checked={snap.enabled}
                      onCheckedChange={(v) => setSnap((s) => ({ ...s, enabled: v }))}
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="snap-threshold" className="text-xs text-zinc-600">
                      Threshold: {snap.thresholdPx}px
                    </Label>
                    <Slider
                      id="snap-threshold"
                      aria-label="Snap threshold in pixels"
                      value={[snap.thresholdPx]}
                      min={2}
                      max={24}
                      step={1}
                      disabled={!snap.enabled}
                      onValueChange={(v) => setSnap((s) => ({ ...s, thresholdPx: v[0] ?? 8 }))}
                    />
                  </div>
                </div>
              </PopoverContent>
            </Popover>

            <Separator orientation="vertical" className="mx-1 h-6" />

            {/* Manual save: a redundant confirm for users who don't trust autosave.
                It just flushes the debounced queue (no separate write path). */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  data-testid="save-now"
                  size="sm"
                  variant="ghost"
                  className="gap-1.5"
                  disabled={autosave.status === 'saving'}
                  onClick={() => autosave.flushNow()}
                >
                  <Save className="size-4" /> Save
                </Button>
              </TooltipTrigger>
              <TooltipContent>Save now — autosave is always on</TooltipContent>
            </Tooltip>

            <span className="flex min-w-20 items-center gap-1.5 text-xs text-zinc-500">
              {autosave.status === 'saving' || autosave.status === 'pending' ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" /> Saving…
                </>
              ) : autosave.status === 'error' ? (
                <button
                  type="button"
                  onClick={() => autosave.flushNow()}
                  className="font-medium text-red-600 hover:text-red-700"
                  aria-label="Retry save"
                >
                  Save failed — retry
                </button>
              ) : autosave.status === 'saved' || autosave.lastSavedAt ? (
                <>
                  <Check className="size-3.5 text-emerald-600" /> Saved
                </>
              ) : null}
            </span>
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          {/* Left tool rail */}
          <nav className="flex w-14 shrink-0 flex-col items-center gap-1 border-r border-zinc-200 bg-white py-3">
            <ToolButton
              active={tool === 'select'}
              label="Select"
              testId="tool-select"
              onClick={() => setTool('select')}
              icon={<MousePointer2 className="size-5" />}
            />
            <ToolButton
              active={tool === 'text'}
              label="Add text"
              testId="tool-text"
              onClick={() => {
                setTool('text');
                addText();
              }}
              icon={<Type className="size-5" />}
            />
            <ToolButton
              active={tool === 'shape'}
              label="Add shape"
              testId="tool-shape"
              onClick={() => {
                setTool('shape');
                addShape();
              }}
              icon={
                shapeKind === 'ellipse' ? (
                  <Circle className="size-5" />
                ) : shapeKind === 'line' ? (
                  <Minus className="size-5" />
                ) : (
                  <Square className="size-5" />
                )
              }
            />
            <ToolButton
              active={tool === 'image'}
              label="Image"
              testId="tool-image"
              onClick={() => setTool('image')}
              icon={<ImageIcon className="size-5" />}
            />
            <Separator className="my-1 w-8" />
            {/* Shape kind picker */}
            <Popover>
              <PopoverTrigger asChild>
                <Button size="icon" variant="ghost" aria-label="Shape kind">
                  {shapeKind === 'ellipse' ? (
                    <Circle className="size-4" />
                  ) : shapeKind === 'line' ? (
                    <Minus className="size-4" />
                  ) : (
                    <Square className="size-4" />
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent side="right" className="w-36 p-1">
                <div className="flex flex-col">
                  {(['rect', 'ellipse', 'line'] as const).map((k) => (
                    <Button
                      key={k}
                      size="sm"
                      variant={shapeKind === k ? 'secondary' : 'ghost'}
                      className="justify-start capitalize"
                      onClick={() => setShapeKind(k)}
                    >
                      {k}
                    </Button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </nav>

          {/* Canvas host */}
          <main ref={canvasHostRef} className="relative min-w-0 flex-1 bg-zinc-200">
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  data-testid="canvas-host"
                  tabIndex={0}
                  role="application"
                  aria-label="Design canvas. Press Tab to cycle elements, arrow keys to move, Delete to remove."
                  onKeyDown={handleCanvasKey}
                  className="absolute inset-0 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-zinc-400"
                >
                  {size.width > 0 && size.height > 0 ? (
                    <CanvasStage
                      doc={doc}
                      panels={vehicle.panels}
                      clips={clips}
                      snap={snap}
                      width={size.width}
                      height={size.height}
                      onSelect={onSelect}
                      onCommit={onCommit}
                      exposeStage={!IS_PROD}
                      onCueChange={setCueVisible}
                    />
                  ) : null}
                  <div
                    data-testid="canvas-ready"
                    className="pointer-events-none absolute bottom-0 right-0 size-px opacity-0"
                  />

                  {elementCount === 0 ? (
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
                      <Card className="pointer-events-auto w-80 text-center">
                        <CardHeader>
                          <CardTitle>Start your wrap</CardTitle>
                          <CardDescription>
                            Add text, a shape, or upload artwork to place it on a panel.
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="flex justify-center gap-2">
                          <Button size="sm" variant="outline" onClick={addText} className="gap-1.5">
                            <Type className="size-4" /> Text
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={addShape}
                            className="gap-1.5"
                          >
                            <Square className="size-4" /> Shape
                          </Button>
                        </CardContent>
                      </Card>
                    </div>
                  ) : null}
                </div>
              </TooltipTrigger>
              <TooltipContent side="top">
                Press Tab to navigate · arrow keys to move · Delete to remove
              </TooltipContent>
            </Tooltip>

            {/* Visually-hidden live region: announces the out-of-bounds state to
                assistive tech (Konva is a canvas and opaque to screen readers). */}
            <div data-testid="oob-announce" role="status" aria-live="polite" className="sr-only">
              {cueVisible ? 'Element is outside the printable area' : ''}
            </div>
          </main>

          {/* Right inspector */}
          <aside className="flex w-64 shrink-0 flex-col gap-4 overflow-y-auto border-l border-zinc-200 bg-white p-4">
            <section className="flex flex-col gap-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Upload
              </h2>
              <UploadPanel
                projectId={projectId}
                targetPanelId={targetPanel?.id ?? null}
                targetView={targetPanel?.view ?? null}
                mintId={mintId}
                onPlaceImage={onPlaceImage}
              />
            </section>

            <Separator />

            <section className="flex flex-col gap-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Selection
              </h2>
              {selectedEl ? (
                <div className="flex flex-col gap-2 text-sm text-zinc-700">
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Type</span>
                    <span className="capitalize">{selectedEl.type}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Panel</span>
                    <span className="truncate">
                      {vehicle.panels.find((p) => p.id === selectedEl.panelId)?.name ??
                        selectedEl.panelId}
                    </span>
                  </div>

                  {selectedEl.type === 'text' ? (
                    <div className="mt-1 flex flex-col gap-2 border-t border-zinc-100 pt-2">
                      <ColorField
                        label="Color"
                        testId="color-fill"
                        value={selectedEl.fill}
                        onCommit={(v) => updateSelectedColor('fill', v ?? '#000000')}
                      />
                    </div>
                  ) : null}

                  {selectedEl.type === 'shape' ? (
                    <div className="mt-1 flex flex-col gap-2 border-t border-zinc-100 pt-2">
                      <ColorField
                        label="Fill"
                        testId="color-fill"
                        value={selectedEl.fill}
                        allowNone
                        onCommit={(v) => updateSelectedColor('fill', v)}
                      />
                      <ColorField
                        label="Stroke"
                        testId="color-stroke"
                        value={selectedEl.stroke}
                        allowNone
                        onCommit={(v) => updateSelectedColor('stroke', v)}
                      />
                    </div>
                  ) : null}

                  <Button size="sm" variant="destructive" onClick={deleteSelected} className="mt-1">
                    Delete
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-zinc-500">Nothing selected.</p>
              )}
            </section>
          </aside>
        </div>
      </div>
    </TooltipProvider>
  );
}

function ToolButton({
  active,
  label,
  testId,
  onClick,
  icon,
}: {
  active: boolean;
  label: string;
  testId: string;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          data-testid={testId}
          size="icon"
          variant={active ? 'secondary' : 'ghost'}
          onClick={onClick}
          aria-label={label}
          aria-pressed={active}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}
