// Wrap Studio primitives — zinc-neutral, light-surface shadcn-derived.
// Direct re-creations of packages/ui/src/components/ui/* and the inline
// patterns used across apps/web/.

const { forwardRef, useEffect, useRef, useState } = React;

function cx(...parts) { return parts.filter(Boolean).join(' '); }

// --- Button ----------------------------------------------------------------
const awsBtnBase = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  whiteSpace: 'nowrap', borderRadius: 6, fontFamily: 'var(--font-sans)',
  fontWeight: 500, transition: 'background-color 150ms, border-color 150ms',
  textDecoration: 'none', cursor: 'pointer', border: '1px solid transparent', lineHeight: 1,
  boxSizing: 'border-box',
};
const awsBtnVariants = {
  primary:     { background: '#18181B', color: '#FFFFFF', boxShadow: '0 1px 2px rgba(0,0,0,.05)' },
  outline:     { background: '#FFFFFF', color: '#18181B', borderColor: '#D4D4D8', boxShadow: '0 1px 2px rgba(0,0,0,.05)' },
  secondary:   { background: '#F4F4F5', color: '#18181B' },
  ghost:       { background: 'transparent', color: '#27272A' },
  destructive: { background: '#DC2626', color: '#FFFFFF' },
  link:        { background: 'transparent', color: '#18181B', padding: 0, height: 'auto' },
};
const awsBtnHover = {
  primary:     { background: '#27272A' },
  outline:     { background: '#FAFAFA' },
  secondary:   { background: '#E4E4E7' },
  ghost:       { background: '#F4F4F5' },
  destructive: { background: '#B91C1C' },
  link:        {},
};
const awsBtnSizes = {
  default: { height: 36, padding: '0 16px', fontSize: 13 },
  sm:      { height: 32, padding: '0 12px', fontSize: 12 },
  lg:      { height: 40, padding: '0 24px', fontSize: 14 },
  icon:    { height: 36, width: 36, padding: 0 },
};

function AwsButton({ variant = 'primary', size = 'default', as: As = 'button', href, children, onClick, style, ...rest }) {
  const [hover, setHover] = useState(false);
  const merged = { ...awsBtnBase, ...awsBtnSizes[size], ...awsBtnVariants[variant], ...(hover ? awsBtnHover[variant] : {}), ...style };
  if (href !== undefined) As = 'a';
  return (
    <As href={href} onClick={onClick} style={merged} onMouseEnter={()=>setHover(true)} onMouseLeave={()=>setHover(false)} {...rest}>
      {children}
    </As>
  );
}

// --- Eyebrow ---------------------------------------------------------------
function Eyebrow({ children, style }) {
  return (
    <p style={{ margin: 0, fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.10em', color: '#71717A', ...style }}>
      {children}
    </p>
  );
}

// --- Label & Input ---------------------------------------------------------
function Label({ htmlFor, children }) {
  return <label htmlFor={htmlFor} style={{ fontSize: 13, fontWeight: 500, color: '#27272A' }}>{children}</label>;
}

function Input({ id, error, style, ...rest }) {
  const [focus, setFocus] = useState(false);
  return (
    <input
      id={id}
      onFocus={() => setFocus(true)}
      onBlur={() => setFocus(false)}
      style={{
        height: 36, width: '100%', boxSizing: 'border-box',
        borderRadius: 6,
        border: '1px solid ' + (error ? '#FCA5A5' : focus ? '#18181B' : '#D4D4D8'),
        padding: '0 12px', fontSize: 14, color: '#18181B', background: '#FFFFFF',
        boxShadow: focus ? '0 0 0 3px rgba(228,228,231,0.65)' : '0 1px 2px rgba(0,0,0,.05)',
        outline: 'none', fontFamily: 'inherit',
        transition: 'border-color 150ms, box-shadow 150ms',
        ...style,
      }}
      {...rest}
    />
  );
}

function Select({ id, disabled, value, onChange, options, placeholder }) {
  const [focus, setFocus] = useState(false);
  return (
    <select
      id={id}
      disabled={disabled}
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
      onFocus={() => setFocus(true)}
      onBlur={() => setFocus(false)}
      style={{
        height: 36, width: '100%', boxSizing: 'border-box', borderRadius: 6,
        border: '1px solid ' + (focus ? '#18181B' : '#D4D4D8'),
        padding: '0 12px', fontSize: 14, background: disabled ? '#F4F4F5' : '#FFFFFF',
        color: disabled ? '#A1A1AA' : '#18181B', cursor: disabled ? 'not-allowed' : 'pointer',
        boxShadow: focus ? '0 0 0 3px rgba(228,228,231,0.65)' : '0 1px 2px rgba(0,0,0,.05)',
        outline: 'none', fontFamily: 'inherit',
        transition: 'border-color 150ms, box-shadow 150ms',
      }}
    >
      <option value="">{placeholder}</option>
      {(options || []).map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

// --- Card ------------------------------------------------------------------
function AwsCard({ children, dashed, hoverable, style, ...rest }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      style={{
        background: '#FFFFFF',
        borderRadius: 12,
        border: '1px solid #E4E4E7',
        borderStyle: dashed ? 'dashed' : 'solid',
        boxShadow: hoverable && hover ? '0 4px 6px -1px rgba(0,0,0,.1), 0 2px 4px -2px rgba(0,0,0,.05)' : '0 1px 3px rgba(0,0,0,.08), 0 1px 2px -1px rgba(0,0,0,.05)',
        transition: 'box-shadow 200ms',
        ...style,
      }}
      onMouseEnter={() => hoverable && setHover(true)}
      onMouseLeave={() => hoverable && setHover(false)}
      {...rest}
    >
      {children}
    </div>
  );
}

// --- Toast (sonner-style) --------------------------------------------------
function Toast({ kind = 'success', children }) {
  const palette = {
    success: { bg: '#ECFDF5', bd: '#A7F3D0', fg: '#064E3B' },
    danger:  { bg: '#FEF2F2', bd: '#FECACA', fg: '#7F1D1D' },
    warning: { bg: '#FFFBEB', bd: '#FDE68A', fg: '#78350F' },
  }[kind] || { bg: '#FFFFFF', bd: '#E4E4E7', fg: '#27272A' };
  return (
    <div style={{ borderRadius: 8, padding: '10px 14px', fontSize: 13, fontWeight: 500, background: palette.bg, border: '1px solid ' + palette.bd, color: palette.fg, boxShadow: '0 4px 6px -1px rgba(0,0,0,.1)' }}>
      {children}
    </div>
  );
}

// --- Lucide-style icon wrappers (inline SVGs) ------------------------------
const I = ({ children, size = 16, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
);
const IconMousePointer = (p) => <I {...p}><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51z"/></I>;
const IconType         = (p) => <I {...p}><path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/></I>;
const IconSquare       = (p) => <I {...p}><rect x="3" y="3" width="18" height="18" rx="2"/></I>;
const IconCircle       = (p) => <I {...p}><circle cx="12" cy="12" r="9"/></I>;
const IconImage        = (p) => <I {...p}><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></I>;
const IconMagnet       = (p) => <I {...p}><path d="m6 15-4-4 6.75-6.77a7.79 7.79 0 0 1 11 11L13 22l-4-4 6.39-6.36a2.14 2.14 0 0 0-3-3L6 15"/><path d="m5 8 4 4"/><path d="m12 15 4 4"/></I>;
const IconUndo         = (p) => <I {...p}><path d="M3 7v6h6"/><path d="M21 17a9 9 0 1 1-3-7"/></I>;
const IconRedo         = (p) => <I {...p}><path d="M21 7v6h-6"/><path d="M3 17a9 9 0 1 1 3-7"/></I>;
const IconCheck        = (p) => <I {...p}><path d="M20 6 9 17l-5-5"/></I>;
const IconLoader       = (p) => <I {...p}><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/></I>;
const IconSearch       = (p) => <I {...p}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></I>;
const IconArrowRight   = (p) => <I {...p}><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></I>;
const IconMore         = (p) => <I {...p}><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></I>;

Object.assign(window, { cx, AwsButton, Eyebrow, Label, Input, Select, AwsCard, Toast,
  IconMousePointer, IconType, IconSquare, IconCircle, IconImage, IconMagnet, IconUndo, IconRedo, IconCheck, IconLoader, IconSearch, IconArrowRight, IconMore });
