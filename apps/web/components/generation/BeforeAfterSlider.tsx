'use client';

// Zero-dependency before/after compare (Goal 7 D5): stock template view render
// underneath, generated preview on top clipped to the slider position. Drag
// anywhere on the image (pointer events) or use the visually-subtle range
// input for keyboard/screen-reader access.

import { useCallback, useRef, useState } from 'react';

interface Props {
  /** Stock template render (the "before"). Hidden gracefully if it 404s. */
  beforeUrl: string | null;
  /** Generated preview (the "after"). */
  afterUrl: string;
  alt: string;
}

export function BeforeAfterSlider({ beforeUrl, afterUrl, alt }: Props) {
  const [pos, setPos] = useState(100); // % of width showing the AFTER image
  const [beforeBroken, setBeforeBroken] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);

  const posFromClientX = useCallback((clientX: number) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return;
    const next = ((clientX - rect.left) / rect.width) * 100;
    setPos(Math.min(100, Math.max(0, next)));
  }, []);

  if (!beforeUrl || beforeBroken) {
    // No stock render available (or it 404'd) — show the generated image
    // plain. Early return narrows beforeUrl to string below.
    return (
      <div className="relative overflow-hidden rounded-md bg-zinc-100" data-testid="before-after">
        {/* Signed/storage URLs — next/image's optimizer can't fetch them. */}
        <img src={afterUrl} alt={alt} className="block w-full select-none" draggable={false} />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      data-testid="before-after"
      className="relative touch-none select-none overflow-hidden rounded-md bg-zinc-100"
      onPointerDown={(e) => {
        draggingRef.current = true;
        (e.target as Element).setPointerCapture?.(e.pointerId);
        posFromClientX(e.clientX);
      }}
      onPointerMove={(e) => {
        if (draggingRef.current) posFromClientX(e.clientX);
      }}
      onPointerUp={() => {
        draggingRef.current = false;
      }}
      onPointerCancel={() => {
        draggingRef.current = false;
      }}
    >
      <img
        src={beforeUrl}
        alt=""
        aria-hidden
        className="block w-full"
        draggable={false}
        onError={() => setBeforeBroken(true)}
      />
      <div
        className="absolute inset-0 overflow-hidden"
        style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
      >
        <img
          src={afterUrl}
          alt={alt}
          className="absolute inset-0 h-full w-full object-cover"
          draggable={false}
        />
      </div>
      {/* Divider handle. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow-[0_0_4px_rgba(0,0,0,0.5)]"
        style={{ left: `${pos}%` }}
      >
        <div className="absolute left-1/2 top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-zinc-300 bg-white shadow" />
      </div>
      <span className="pointer-events-none absolute left-2 top-2 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white">
        Before
      </span>
      <span className="pointer-events-none absolute right-2 top-2 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white">
        After
      </span>
      <input
        type="range"
        min={0}
        max={100}
        value={Math.round(pos)}
        onChange={(e) => setPos(Number(e.target.value))}
        aria-label="Compare before and after"
        className="absolute bottom-1 left-1/2 h-2 w-1/3 -translate-x-1/2 cursor-ew-resize opacity-0 focus-visible:opacity-100"
      />
    </div>
  );
}
