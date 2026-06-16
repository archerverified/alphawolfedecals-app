// WrapEditor — three-pane shell modeled after components/editor/CanvasEditor.tsx.
// Tool rail (left, 56 px) · canvas host (fluid) · inspector (right, 256 px).

const { useState: useEditorState } = React;

function ToolRailButton({ active, label, icon, onClick }) {
  const [hover, setHover] = useEditorState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      title={label}
      style={{
        width: 36, height: 36, borderRadius: 6, border: 0,
        background: active ? '#F4F4F5' : hover ? '#F4F4F5' : 'transparent',
        color: '#27272A', cursor: 'pointer',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        transition: 'background-color 150ms',
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {icon}
    </button>
  );
}

function WrapEditor({ vehicleLabel = '2024 Ford Transit 250 · 148″WB High Roof', onBack }) {
  const [tool, setTool] = useEditorState('select');
  const [elements, setElements] = useEditorState([]);
  const [autosave, setAutosave] = useEditorState('saved');

  function add(kind) {
    const next = { id: 'el-' + Math.random().toString(36).slice(2, 7), kind,
      x: 220 + (elements.length % 6) * 40, y: 180 + (elements.length % 6) * 40 };
    setElements((prev) => [...prev, next]);
    setAutosave('saving');
    setTimeout(() => setAutosave('saved'), 700);
  }
  function clear() { setElements([]); setAutosave('saving'); setTimeout(() => setAutosave('saved'), 400); }

  return (
    <div data-screen-label="04 Editor" style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#F4F4F5', color: '#18181B' }}>
      {/* Top bar */}
      <header style={{ display: 'flex', height: 48, flexShrink: 0, alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #E4E4E7', background: '#FFFFFF', padding: '0 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={onBack} style={{ border: 0, background: 'transparent', padding: 6, borderRadius: 6, cursor: 'pointer', color: '#52525B', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
            Projects
          </button>
          <span style={{ width: 1, height: 16, background: '#E4E4E7' }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: '#18181B' }}>{vehicleLabel}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <ToolRailButton label="Undo" icon={<IconUndo size={16} />} />
          <ToolRailButton label="Redo" icon={<IconRedo size={16} />} />
          <span style={{ width: 1, height: 16, background: '#E4E4E7', margin: '0 6px' }} />
          <button style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 28, padding: '0 10px', borderRadius: 6, border: 0, background: 'transparent', color: '#27272A', cursor: 'pointer', fontSize: 12 }}>
            <IconMagnet size={14} /> Snap
          </button>
          <span style={{ width: 1, height: 16, background: '#E4E4E7', margin: '0 6px' }} />
          <span style={{ minWidth: 80, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#71717A' }}>
            {autosave === 'saving'
              ? <><span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: '50%', border: '1.5px solid #E4E4E7', borderTopColor: '#52525B', animation: 'aws-spin 0.8s linear infinite' }}/> Saving…</>
              : <><span style={{ color: '#059669', display: 'inline-flex' }}><IconCheck size={14} /></span> Saved</>}
          </span>
        </div>
      </header>

      {/* Body */}
      <div style={{ display: 'flex', minHeight: 0, flex: 1 }}>
        {/* Tool rail */}
        <nav style={{ width: 56, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, borderRight: '1px solid #E4E4E7', background: '#FFFFFF', padding: '12px 0' }}>
          <ToolRailButton active={tool === 'select'} label="Select" icon={<IconMousePointer size={20} />} onClick={() => setTool('select')} />
          <ToolRailButton active={tool === 'text'} label="Add text" icon={<IconType size={20} />} onClick={() => { setTool('text'); add('text'); }} />
          <ToolRailButton active={tool === 'shape'} label="Add shape" icon={<IconSquare size={20} />} onClick={() => { setTool('shape'); add('shape'); }} />
          <ToolRailButton active={tool === 'image'} label="Image" icon={<IconImage size={20} />} onClick={() => setTool('image')} />
        </nav>

        {/* Canvas host */}
        <main style={{ position: 'relative', minWidth: 0, flex: 1, background: '#E4E4E7' }}>
          <CanvasMock elements={elements} onAddText={() => add('text')} onAddShape={() => add('shape')} />
        </main>

        {/* Right inspector */}
        <aside style={{ width: 256, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto', borderLeft: '1px solid #E4E4E7', background: '#FFFFFF', padding: 16 }}>
          <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <h2 style={{ margin: 0, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.10em', color: '#71717A' }}>Upload</h2>
            <div style={{ border: '1px dashed #D4D4D8', borderRadius: 8, padding: '20px 12px', textAlign: 'center', fontSize: 12, color: '#71717A' }}>
              Drop AI · EPS · PDF · SVG · PNG · JPG · HEIC<br/>
              <span style={{ color: '#A1A1AA' }}>up to 50 MB</span>
            </div>
          </section>
          <div style={{ height: 1, background: '#E4E4E7' }} />
          <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <h2 style={{ margin: 0, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.10em', color: '#71717A' }}>Selection</h2>
            {elements.length === 0
              ? <p style={{ margin: 0, fontSize: 13, color: '#71717A' }}>Nothing selected.</p>
              : <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: '#3F3F46' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#71717A' }}>Type</span><span style={{ textTransform: 'capitalize' }}>{elements[elements.length-1].kind}</span></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#71717A' }}>Panel</span><span>Driver quarter</span></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#71717A' }}>Position</span><span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{elements[elements.length-1].x}, {elements[elements.length-1].y}</span></div>
                  </div>
                  <AwsButton variant="destructive" size="sm" onClick={clear} style={{ marginTop: 6 }}>Delete</AwsButton>
                </>}
          </section>
          <div style={{ height: 1, background: '#E4E4E7' }} />
          <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <h2 style={{ margin: 0, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.10em', color: '#71717A' }}>Export</h2>
            <AwsButton variant="primary" size="default">Export production PDF</AwsButton>
            <AwsButton variant="outline" size="default">Customer mockup PDF</AwsButton>
          </section>
        </aside>
      </div>
      <style>{`@keyframes aws-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function CanvasMock({ elements, onAddText, onAddShape }) {
  // Stage centered preview of a van outline with placed elements
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
      <div style={{ position: 'relative', width: '100%', maxWidth: 720, aspectRatio: '16/9', background: '#FFFFFF', border: '1px solid #D4D4D8', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,.08)', overflow: 'hidden' }}>
        {/* Vehicle outline */}
        <svg viewBox="0 0 800 450" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
          <g fill="none" stroke="#A1A1AA" strokeWidth="1.2" strokeLinejoin="round">
            <path d="M 80 360 L 80 130 Q 80 110 105 110 L 600 110 Q 660 110 690 145 L 720 230 L 730 290 Q 732 350 715 360 Z" />
            <line x1="80" y1="360" x2="730" y2="360" />
            <rect x="105" y="125" width="120" height="60" rx="4" stroke="#D4D4D8" />
            <line x1="280" y1="110" x2="280" y2="360" stroke="#D4D4D8" />
            <line x1="460" y1="110" x2="460" y2="360" stroke="#D4D4D8" />
            <rect x="540" y="125" width="170" height="100" rx="4" stroke="#D4D4D8" />
          </g>
          {/* Wheels */}
          <circle cx="190" cy="360" r="26" fill="#FFFFFF" stroke="#A1A1AA" strokeWidth="1.5"/>
          <circle cx="190" cy="360" r="11" fill="#A1A1AA"/>
          <circle cx="620" cy="360" r="26" fill="#FFFFFF" stroke="#A1A1AA" strokeWidth="1.5"/>
          <circle cx="620" cy="360" r="11" fill="#A1A1AA"/>
          {/* Placed elements */}
          {elements.map((el, i) => {
            if (el.kind === 'text') return (
              <text key={el.id} x={el.x} y={el.y} fontFamily="var(--font-sans)" fontSize="18" fill="#18181B" fontWeight="700">Double-click to edit</text>
            );
            if (el.kind === 'shape') return (
              <rect key={el.id} x={el.x} y={el.y - 30} width="100" height="60" fill="#00AEEF" opacity={0.6} rx="3" />
            );
            return null;
          })}
          {/* Selection bounding box around last element */}
          {elements.length > 0 && (
            <g transform={`translate(${elements[elements.length-1].x - 8} ${elements[elements.length-1].y - (elements[elements.length-1].kind==='shape'?38:24)})`}>
              <rect width={elements[elements.length-1].kind === 'shape' ? 116 : 220} height={elements[elements.length-1].kind === 'shape' ? 76 : 32} fill="none" stroke="#18181B" strokeWidth="1.2" strokeDasharray="3 3" />
            </g>
          )}
        </svg>
        {/* Empty state card */}
        {elements.length === 0 && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, pointerEvents: 'none' }}>
            <div style={{ pointerEvents: 'auto', width: 320, textAlign: 'center', background: '#FFFFFF', border: '1px solid #E4E4E7', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,.08)', padding: 24 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#18181B' }}>Start your wrap</h3>
              <p style={{ margin: '8px 0 16px', fontSize: 13, color: '#52525B', lineHeight: 1.5 }}>Add text, a shape, or upload artwork to place it on a panel.</p>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
                <AwsButton variant="outline" size="sm" onClick={onAddText}><IconType size={14} /> Text</AwsButton>
                <AwsButton variant="outline" size="sm" onClick={onAddShape}><IconSquare size={14} /> Shape</AwsButton>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

Object.assign(window, { WrapEditor });
