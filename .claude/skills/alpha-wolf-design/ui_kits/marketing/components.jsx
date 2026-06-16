// Alpha Wolf Decals — primitives shared across the marketing site.
// Re-creations of components/ui/* and components/brand/logo.tsx in pure
// React. All styling via Tailwind-style utilities written as inline objects
// or via classes that map onto the design tokens in colors_and_type.css.

const { forwardRef, useEffect, useRef, useState } = React;

// --- helpers ---------------------------------------------------------------
function cx(...parts) {
  return parts.filter(Boolean).join(' ');
}

// --- Logo ------------------------------------------------------------------
function Logo({ size = 'sm', priority = false, className = '' }) {
  // Source aspect: 2399 × 750 = ~3.2:1
  const px = { sm: 32, md: 40, lg: 64, xl: 112 }[size];
  return (
    <img
      src="../../assets/logo.png"
      alt="Alpha Wolf Decals"
      width={Math.round(px * (2399 / 750))}
      height={px}
      className={cx('select-none', className)}
      style={{ height: px, width: 'auto', display: 'block' }}
      loading={priority ? 'eager' : 'lazy'}
    />
  );
}

// --- Button ----------------------------------------------------------------
const buttonBase = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  whiteSpace: 'nowrap',
  borderRadius: 6,
  fontFamily: 'var(--font-sans)',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  transition: 'background-color 200ms, color 200ms, border-color 200ms',
  textDecoration: 'none',
  cursor: 'pointer',
  border: '1px solid transparent',
  lineHeight: 1,
};

const buttonVariants = {
  primary: {
    background: '#00AEEF',
    color: '#000000',
    borderColor: 'transparent',
  },
  secondary: {
    background: '#000000',
    color: '#FFFFFF',
    borderColor: '#2A2A2A',
  },
  ghost: {
    background: 'transparent',
    color: '#FFFFFF',
    borderColor: 'transparent',
  },
  outline: {
    background: 'transparent',
    color: '#00AEEF',
    borderColor: '#00AEEF',
  },
  link: {
    background: 'transparent',
    color: '#00AEEF',
    border: 'none',
    padding: 0,
    height: 'auto',
    textTransform: 'none',
    letterSpacing: 'normal',
    fontWeight: 600,
  },
};

const buttonSizes = {
  sm: { height: 36, padding: '0 12px', fontSize: 12 },
  default: { height: 44, padding: '0 20px', fontSize: 13 },
  lg: { height: 48, padding: '0 24px', fontSize: 15 },
  icon: { height: 44, width: 44, padding: 0 },
};

const buttonHover = {
  primary: { background: 'rgba(0,174,239,0.9)' },
  secondary: { background: '#1A1A1A' },
  ghost: { background: '#1A1A1A' },
  outline: { background: 'rgba(0,174,239,0.10)' },
  link: { textDecoration: 'underline', textUnderlineOffset: 4 },
};

function Button({
  variant = 'primary',
  size = 'default',
  as: As = 'button',
  href,
  children,
  onClick,
  style,
  ...rest
}) {
  const [hover, setHover] = useState(false);
  const merged = {
    ...buttonBase,
    ...buttonSizes[size],
    ...buttonVariants[variant],
    ...(hover ? buttonHover[variant] : {}),
    ...style,
  };
  if (href !== undefined) {
    As = 'a';
  }
  return (
    <As
      href={href}
      onClick={onClick}
      style={merged}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      {...rest}
    >
      {children}
    </As>
  );
}

// --- Badge -----------------------------------------------------------------
const badgeVariants = {
  default: { borderColor: '#2A2A2A', background: '#1A1A1A', color: '#FFFFFF' },
  blue: { borderColor: 'transparent', background: '#00AEEF', color: '#000000' },
  outline: { borderColor: '#00AEEF', background: 'transparent', color: '#00AEEF' },
  muted: { borderColor: 'transparent', background: '#1A1A1A', color: '#9CA3AF' },
};
function Badge({ variant = 'default', children, style }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        borderRadius: 9999,
        padding: '2px 10px',
        fontSize: 11,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.12em',
        border: '1px solid',
        ...badgeVariants[variant],
        ...style,
      }}
    >
      {children}
    </span>
  );
}

// --- Card ------------------------------------------------------------------
function Card({ children, style, ...rest }) {
  return (
    <div
      style={{
        borderRadius: 8,
        border: '1px solid #1A1A1A',
        background: '#000000',
        color: '#FFFFFF',
        boxShadow: '0 1px 3px 0 rgba(0,0,0,0.4)',
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}

// --- SectionHeading --------------------------------------------------------
function SectionHeading({ eyebrow, title, lede, align = 'left', level = 'h2' }) {
  const Heading = level;
  const headingSize = {
    h1: { fontSize: 'clamp(32px, 4.5vw, 60px)' },
    h2: { fontSize: 'clamp(28px, 3.5vw, 44px)' },
    h3: { fontSize: 'clamp(22px, 2.5vw, 30px)' },
  }[level];
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        textAlign: align,
        margin: align === 'center' ? '0 auto' : undefined,
      }}
    >
      {eyebrow && (
        <p
          style={{
            fontSize: 12,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.20em',
            color: '#00AEEF',
            margin: 0,
          }}
        >
          {eyebrow}
        </p>
      )}
      <Heading
        style={{
          margin: 0,
          fontFamily: 'var(--font-sans)',
          fontWeight: 700,
          lineHeight: 1.05,
          letterSpacing: '-0.02em',
          color: '#FFFFFF',
          ...headingSize,
        }}
      >
        {title}
      </Heading>
      {lede && (
        <p
          style={{
            fontSize: 17,
            lineHeight: 1.55,
            color: '#9CA3AF',
            margin: 0,
            maxWidth: align === 'center' ? 640 : 760,
          }}
        >
          {lede}
        </p>
      )}
    </div>
  );
}

// --- SiteHeader ------------------------------------------------------------
function SiteHeader({ currentPath = '/', onNavigate }) {
  const [servicesOpen, setServicesOpen] = useState(false);
  const services = [
    { label: 'Vinyl Wraps', href: '/services/vinyl-wraps', description: 'Personal-vehicle wraps in any finish.' },
    { label: 'Commercial Wraps', href: '/services/commercial-wraps', description: 'Fleet, vans, trailers, work trucks.' },
    { label: 'Vehicle Tint', href: '/services/vehicle-tint', description: 'Ceramic and dyed window tint.' },
    { label: 'Paint Protection Film', href: '/services/paint-protection-film', description: 'PPF / clear-bra with self-healing topcoat.' },
    { label: 'Color-Change Wraps', href: '/services/color-change-wraps', description: 'Reversible color over factory paint.' },
    { label: 'Storefronts & Signage', href: '/services/storefronts-signage', description: 'Storefront windows, building wraps, banners.' },
  ];
  const primary = [
    { label: 'Gallery', href: '/gallery' },
    { label: 'About', href: '/about' },
    { label: 'FAQ', href: '/faq' },
    { label: 'Contact', href: '/contact' },
  ];

  const go = (href) => (e) => {
    e.preventDefault();
    setServicesOpen(false);
    onNavigate?.(href);
  };

  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 40,
        width: '100%',
        borderBottom: '1px solid #1A1A1A',
        background: 'rgba(10,10,10,0.85)',
        backdropFilter: 'blur(10px)',
      }}
    >
      <div
        style={{
          margin: '0 auto',
          display: 'flex',
          height: 64,
          maxWidth: 1280,
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          padding: '0 24px',
        }}
      >
        <a href="/" onClick={go('/')} style={{ display: 'inline-flex', alignItems: 'center' }}>
          <Logo size="sm" priority />
        </a>

        <nav aria-label="Primary" style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setServicesOpen((o) => !o)}
              aria-expanded={servicesOpen}
              style={{
                height: 44,
                padding: '0 12px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                background: 'transparent',
                border: 'none',
                color: servicesOpen ? '#FFFFFF' : '#9CA3AF',
                fontSize: 14,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Services
              <svg
                viewBox="0 0 12 12"
                width="10"
                height="10"
                style={{
                  transform: servicesOpen ? 'rotate(-180deg)' : 'none',
                  transition: 'transform 200ms cubic-bezier(0.32, 0.72, 0, 1)',
                }}
              >
                <path d="M2.5 4.5l3.5 3 3.5-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {servicesOpen && (
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  top: '100%',
                  zIndex: 40,
                  marginTop: 12,
                  width: 448,
                  borderRadius: 8,
                  border: '1px solid #1A1A1A',
                  background: '#000000',
                  padding: 8,
                  boxShadow: '0 25px 50px -12px rgba(0,0,0,0.7)',
                }}
              >
                <ul style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, margin: 0, padding: 0, listStyle: 'none' }}>
                  {services.map((s) => (
                    <li key={s.href}>
                      <a
                        href={s.href}
                        onClick={go(s.href)}
                        style={{
                          display: 'block',
                          borderRadius: 6,
                          padding: '10px 12px',
                          textDecoration: 'none',
                          transition: 'background-color 200ms',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = '#1A1A1A')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      >
                        <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#FFFFFF' }}>{s.label}</span>
                        <span style={{ display: 'block', marginTop: 2, fontSize: 12, color: '#8B92A0', lineHeight: 1.4 }}>{s.description}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {primary.map((l) => (
            <a
              key={l.href}
              href={l.href}
              onClick={go(l.href)}
              style={{
                height: 44,
                padding: '0 12px',
                display: 'inline-flex',
                alignItems: 'center',
                color: currentPath === l.href ? '#FFFFFF' : '#9CA3AF',
                fontSize: 14,
                fontWeight: 500,
                textDecoration: 'none',
                transition: 'color 200ms',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#FFFFFF')}
              onMouseLeave={(e) => (e.currentTarget.style.color = currentPath === l.href ? '#FFFFFF' : '#9CA3AF')}
            >
              {l.label}
            </a>
          ))}
        </nav>

        <a
          href="/quote"
          onClick={go('/quote')}
          style={{
            height: 40,
            padding: '0 20px',
            background: '#00AEEF',
            color: '#000000',
            fontSize: 13,
            fontWeight: 600,
            borderRadius: 6,
            display: 'inline-flex',
            alignItems: 'center',
            textDecoration: 'none',
            transition: 'background-color 200ms',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(0,174,239,0.9)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = '#00AEEF')}
        >
          Get a Quote
        </a>
      </div>
    </header>
  );
}

// --- SiteFooter ------------------------------------------------------------
function SiteFooter({ onNavigate }) {
  const go = (href) => (e) => { e.preventDefault(); onNavigate?.(href); };
  return (
    <footer style={{ background: '#000000', borderTop: '1px solid #1A1A1A', color: '#9CA3AF' }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '64px 24px 24px', display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1fr', gap: 48 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Logo size="md" />
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, maxWidth: 320 }}>
            Salem, Oregon vinyl wraps, ceramic tint, paint protection film, and storefront signage. One shop floor — quote to install.
          </p>
          <p style={{ margin: 0, fontFamily: 'var(--font-mono)', fontSize: 12, color: '#00AEEF', letterSpacing: '0.18em', textTransform: 'uppercase' }}>
            Kashmir Way SE · Salem, OR
          </p>
        </div>
        <FooterCol title="Services" items={['Vinyl Wraps','Commercial Wraps','Vehicle Tint','Paint Protection','Color Change','Signage']} />
        <FooterCol title="Shop" items={['Gallery','About','FAQ','Financing','Gift Cards','Locations']} />
        <FooterCol title="Get in touch" items={['Get a Quote','Book Now','Contact','Newsletter']} />
      </div>
      <div style={{ borderTop: '1px solid #1A1A1A', padding: '20px 24px', textAlign: 'center', fontSize: 12 }}>
        © 2026 Alpha Wolf Decals · Salem, OR
      </div>
    </footer>
  );
}

function FooterCol({ title, items }) {
  return (
    <div>
      <h4 style={{ margin: 0, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.20em', color: '#FFFFFF' }}>{title}</h4>
      <ul style={{ margin: '16px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.map((i) => (
          <li key={i}>
            <a href="#" onClick={(e) => e.preventDefault()} style={{ color: '#9CA3AF', textDecoration: 'none', fontSize: 13 }} onMouseEnter={(e)=>e.currentTarget.style.color='#FFFFFF'} onMouseLeave={(e)=>e.currentTarget.style.color='#9CA3AF'}>{i}</a>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Expose to other scripts
Object.assign(window, { cx, Logo, Button, Badge, Card, SectionHeading, SiteHeader, SiteFooter });
