/* @ds-bundle: {"format":3,"namespace":"AlphaWolfDecalsDesignSystem_9d20f9","components":[],"sourceHashes":{"ui_kits/marketing/components.jsx":"6807a411c8a8","ui_kits/marketing/pages.jsx":"41858548c028","ui_kits/marketing/sections.jsx":"654486fd2fc2","ui_kits/marketing/service-art.jsx":"3c23b4137297","ui_kits/wrap_studio/components.jsx":"24b417107a90","ui_kits/wrap_studio/editor.jsx":"d64d5dfc0144","ui_kits/wrap_studio/pages.jsx":"d64ad6e2dac9","ui_kits/wrap_studio/vehicle.jsx":"fbf68310d88c","uploads/fonts.ts":"891080b1303c"},"inlinedExternals":[],"unexposedExports":[{"name":"fontVariables","sourcePath":"uploads/fonts.ts"},{"name":"monoFont","sourcePath":"uploads/fonts.ts"},{"name":"sansFont","sourcePath":"uploads/fonts.ts"}]} */

(() => {

const __ds_ns = (window.AlphaWolfDecalsDesignSystem_9d20f9 = window.AlphaWolfDecalsDesignSystem_9d20f9 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// ui_kits/marketing/components.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
// Alpha Wolf Decals — primitives shared across the marketing site.
// Re-creations of components/ui/* and components/brand/logo.tsx in pure
// React. All styling via Tailwind-style utilities written as inline objects
// or via classes that map onto the design tokens in colors_and_type.css.

const {
  forwardRef,
  useEffect,
  useRef,
  useState
} = React;

// --- helpers ---------------------------------------------------------------
function cx(...parts) {
  return parts.filter(Boolean).join(' ');
}

// --- Logo ------------------------------------------------------------------
function Logo({
  size = 'sm',
  priority = false,
  className = ''
}) {
  // Source aspect: 2399 × 750 = ~3.2:1
  const px = {
    sm: 32,
    md: 40,
    lg: 64,
    xl: 112
  }[size];
  return /*#__PURE__*/React.createElement("img", {
    src: "../../assets/logo.png",
    alt: "Alpha Wolf Decals",
    width: Math.round(px * (2399 / 750)),
    height: px,
    className: cx('select-none', className),
    style: {
      height: px,
      width: 'auto',
      display: 'block'
    },
    loading: priority ? 'eager' : 'lazy'
  });
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
  lineHeight: 1
};
const buttonVariants = {
  primary: {
    background: '#00AEEF',
    color: '#000000',
    borderColor: 'transparent'
  },
  secondary: {
    background: '#000000',
    color: '#FFFFFF',
    borderColor: '#2A2A2A'
  },
  ghost: {
    background: 'transparent',
    color: '#FFFFFF',
    borderColor: 'transparent'
  },
  outline: {
    background: 'transparent',
    color: '#00AEEF',
    borderColor: '#00AEEF'
  },
  link: {
    background: 'transparent',
    color: '#00AEEF',
    border: 'none',
    padding: 0,
    height: 'auto',
    textTransform: 'none',
    letterSpacing: 'normal',
    fontWeight: 600
  }
};
const buttonSizes = {
  sm: {
    height: 36,
    padding: '0 12px',
    fontSize: 12
  },
  default: {
    height: 44,
    padding: '0 20px',
    fontSize: 13
  },
  lg: {
    height: 48,
    padding: '0 24px',
    fontSize: 15
  },
  icon: {
    height: 44,
    width: 44,
    padding: 0
  }
};
const buttonHover = {
  primary: {
    background: 'rgba(0,174,239,0.9)'
  },
  secondary: {
    background: '#1A1A1A'
  },
  ghost: {
    background: '#1A1A1A'
  },
  outline: {
    background: 'rgba(0,174,239,0.10)'
  },
  link: {
    textDecoration: 'underline',
    textUnderlineOffset: 4
  }
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
    ...style
  };
  if (href !== undefined) {
    As = 'a';
  }
  return /*#__PURE__*/React.createElement(As, _extends({
    href: href,
    onClick: onClick,
    style: merged,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false)
  }, rest), children);
}

// --- Badge -----------------------------------------------------------------
const badgeVariants = {
  default: {
    borderColor: '#2A2A2A',
    background: '#1A1A1A',
    color: '#FFFFFF'
  },
  blue: {
    borderColor: 'transparent',
    background: '#00AEEF',
    color: '#000000'
  },
  outline: {
    borderColor: '#00AEEF',
    background: 'transparent',
    color: '#00AEEF'
  },
  muted: {
    borderColor: 'transparent',
    background: '#1A1A1A',
    color: '#9CA3AF'
  }
};
function Badge({
  variant = 'default',
  children,
  style
}) {
  return /*#__PURE__*/React.createElement("span", {
    style: {
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
      ...style
    }
  }, children);
}

// --- Card ------------------------------------------------------------------
function Card({
  children,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      borderRadius: 8,
      border: '1px solid #1A1A1A',
      background: '#000000',
      color: '#FFFFFF',
      boxShadow: '0 1px 3px 0 rgba(0,0,0,0.4)',
      ...style
    }
  }, rest), children);
}

// --- SectionHeading --------------------------------------------------------
function SectionHeading({
  eyebrow,
  title,
  lede,
  align = 'left',
  level = 'h2'
}) {
  const Heading = level;
  const headingSize = {
    h1: {
      fontSize: 'clamp(32px, 4.5vw, 60px)'
    },
    h2: {
      fontSize: 'clamp(28px, 3.5vw, 44px)'
    },
    h3: {
      fontSize: 'clamp(22px, 2.5vw, 30px)'
    }
  }[level];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 16,
      textAlign: align,
      margin: align === 'center' ? '0 auto' : undefined
    }
  }, eyebrow && /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 12,
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.20em',
      color: '#00AEEF',
      margin: 0
    }
  }, eyebrow), /*#__PURE__*/React.createElement(Heading, {
    style: {
      margin: 0,
      fontFamily: 'var(--font-sans)',
      fontWeight: 700,
      lineHeight: 1.05,
      letterSpacing: '-0.02em',
      color: '#FFFFFF',
      ...headingSize
    }
  }, title), lede && /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 17,
      lineHeight: 1.55,
      color: '#9CA3AF',
      margin: 0,
      maxWidth: align === 'center' ? 640 : 760
    }
  }, lede));
}

// --- SiteHeader ------------------------------------------------------------
function SiteHeader({
  currentPath = '/',
  onNavigate
}) {
  const [servicesOpen, setServicesOpen] = useState(false);
  const services = [{
    label: 'Vinyl Wraps',
    href: '/services/vinyl-wraps',
    description: 'Personal-vehicle wraps in any finish.'
  }, {
    label: 'Commercial Wraps',
    href: '/services/commercial-wraps',
    description: 'Fleet, vans, trailers, work trucks.'
  }, {
    label: 'Vehicle Tint',
    href: '/services/vehicle-tint',
    description: 'Ceramic and dyed window tint.'
  }, {
    label: 'Paint Protection Film',
    href: '/services/paint-protection-film',
    description: 'PPF / clear-bra with self-healing topcoat.'
  }, {
    label: 'Color-Change Wraps',
    href: '/services/color-change-wraps',
    description: 'Reversible color over factory paint.'
  }, {
    label: 'Storefronts & Signage',
    href: '/services/storefronts-signage',
    description: 'Storefront windows, building wraps, banners.'
  }];
  const primary = [{
    label: 'Gallery',
    href: '/gallery'
  }, {
    label: 'About',
    href: '/about'
  }, {
    label: 'FAQ',
    href: '/faq'
  }, {
    label: 'Contact',
    href: '/contact'
  }];
  const go = href => e => {
    e.preventDefault();
    setServicesOpen(false);
    onNavigate?.(href);
  };
  return /*#__PURE__*/React.createElement("header", {
    style: {
      position: 'sticky',
      top: 0,
      zIndex: 40,
      width: '100%',
      borderBottom: '1px solid #1A1A1A',
      background: 'rgba(10,10,10,0.85)',
      backdropFilter: 'blur(10px)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      margin: '0 auto',
      display: 'flex',
      height: 64,
      maxWidth: 1280,
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 16,
      padding: '0 24px'
    }
  }, /*#__PURE__*/React.createElement("a", {
    href: "/",
    onClick: go('/'),
    style: {
      display: 'inline-flex',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement(Logo, {
    size: "sm",
    priority: true
  })), /*#__PURE__*/React.createElement("nav", {
    "aria-label": "Primary",
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => setServicesOpen(o => !o),
    "aria-expanded": servicesOpen,
    style: {
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
      cursor: 'pointer'
    }
  }, "Services", /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 12 12",
    width: "10",
    height: "10",
    style: {
      transform: servicesOpen ? 'rotate(-180deg)' : 'none',
      transition: 'transform 200ms cubic-bezier(0.32, 0.72, 0, 1)'
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: "M2.5 4.5l3.5 3 3.5-3",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.5",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }))), servicesOpen && /*#__PURE__*/React.createElement("div", {
    style: {
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
      boxShadow: '0 25px 50px -12px rgba(0,0,0,0.7)'
    }
  }, /*#__PURE__*/React.createElement("ul", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 4,
      margin: 0,
      padding: 0,
      listStyle: 'none'
    }
  }, services.map(s => /*#__PURE__*/React.createElement("li", {
    key: s.href
  }, /*#__PURE__*/React.createElement("a", {
    href: s.href,
    onClick: go(s.href),
    style: {
      display: 'block',
      borderRadius: 6,
      padding: '10px 12px',
      textDecoration: 'none',
      transition: 'background-color 200ms'
    },
    onMouseEnter: e => e.currentTarget.style.background = '#1A1A1A',
    onMouseLeave: e => e.currentTarget.style.background = 'transparent'
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      fontSize: 14,
      fontWeight: 600,
      color: '#FFFFFF'
    }
  }, s.label), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      marginTop: 2,
      fontSize: 12,
      color: '#8B92A0',
      lineHeight: 1.4
    }
  }, s.description))))))), primary.map(l => /*#__PURE__*/React.createElement("a", {
    key: l.href,
    href: l.href,
    onClick: go(l.href),
    style: {
      height: 44,
      padding: '0 12px',
      display: 'inline-flex',
      alignItems: 'center',
      color: currentPath === l.href ? '#FFFFFF' : '#9CA3AF',
      fontSize: 14,
      fontWeight: 500,
      textDecoration: 'none',
      transition: 'color 200ms'
    },
    onMouseEnter: e => e.currentTarget.style.color = '#FFFFFF',
    onMouseLeave: e => e.currentTarget.style.color = currentPath === l.href ? '#FFFFFF' : '#9CA3AF'
  }, l.label))), /*#__PURE__*/React.createElement("a", {
    href: "/quote",
    onClick: go('/quote'),
    style: {
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
      transition: 'background-color 200ms'
    },
    onMouseEnter: e => e.currentTarget.style.background = 'rgba(0,174,239,0.9)',
    onMouseLeave: e => e.currentTarget.style.background = '#00AEEF'
  }, "Get a Quote")));
}

// --- SiteFooter ------------------------------------------------------------
function SiteFooter({
  onNavigate
}) {
  const go = href => e => {
    e.preventDefault();
    onNavigate?.(href);
  };
  return /*#__PURE__*/React.createElement("footer", {
    style: {
      background: '#000000',
      borderTop: '1px solid #1A1A1A',
      color: '#9CA3AF'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 1280,
      margin: '0 auto',
      padding: '64px 24px 24px',
      display: 'grid',
      gridTemplateColumns: '1.4fr 1fr 1fr 1fr',
      gap: 48
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 16
    }
  }, /*#__PURE__*/React.createElement(Logo, {
    size: "md"
  }), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 14,
      lineHeight: 1.6,
      maxWidth: 320
    }
  }, "Salem, Oregon vinyl wraps, ceramic tint, paint protection film, and storefront signage. One shop floor \u2014 quote to install."), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontFamily: 'var(--font-mono)',
      fontSize: 12,
      color: '#00AEEF',
      letterSpacing: '0.18em',
      textTransform: 'uppercase'
    }
  }, "Kashmir Way SE \xB7 Salem, OR")), /*#__PURE__*/React.createElement(FooterCol, {
    title: "Services",
    items: ['Vinyl Wraps', 'Commercial Wraps', 'Vehicle Tint', 'Paint Protection', 'Color Change', 'Signage']
  }), /*#__PURE__*/React.createElement(FooterCol, {
    title: "Shop",
    items: ['Gallery', 'About', 'FAQ', 'Financing', 'Gift Cards', 'Locations']
  }), /*#__PURE__*/React.createElement(FooterCol, {
    title: "Get in touch",
    items: ['Get a Quote', 'Book Now', 'Contact', 'Newsletter']
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      borderTop: '1px solid #1A1A1A',
      padding: '20px 24px',
      textAlign: 'center',
      fontSize: 12
    }
  }, "\xA9 2026 Alpha Wolf Decals \xB7 Salem, OR"));
}
function FooterCol({
  title,
  items
}) {
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h4", {
    style: {
      margin: 0,
      fontSize: 11,
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.20em',
      color: '#FFFFFF'
    }
  }, title), /*#__PURE__*/React.createElement("ul", {
    style: {
      margin: '16px 0 0',
      padding: 0,
      listStyle: 'none',
      display: 'flex',
      flexDirection: 'column',
      gap: 10
    }
  }, items.map(i => /*#__PURE__*/React.createElement("li", {
    key: i
  }, /*#__PURE__*/React.createElement("a", {
    href: "#",
    onClick: e => e.preventDefault(),
    style: {
      color: '#9CA3AF',
      textDecoration: 'none',
      fontSize: 13
    },
    onMouseEnter: e => e.currentTarget.style.color = '#FFFFFF',
    onMouseLeave: e => e.currentTarget.style.color = '#9CA3AF'
  }, i)))));
}

// Expose to other scripts
Object.assign(window, {
  cx,
  Logo,
  Button,
  Badge,
  Card,
  SectionHeading,
  SiteHeader,
  SiteFooter
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/marketing/components.jsx", error: String((e && e.message) || e) }); }

// ui_kits/marketing/pages.jsx
try { (() => {
// Composed marketing pages. Real Next.js routes:
//   /                              -> HomePage
//   /about                         -> AboutPage
//   /services/[slug]               -> ServiceDetailPage
//   /quote, /book, /contact, etc.  -> stub pages

function HomePage({
  onNavigate
}) {
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Hero, {
    onNavigate: onNavigate
  }), /*#__PURE__*/React.createElement(ServicesGrid, {
    onNavigate: onNavigate
  }), /*#__PURE__*/React.createElement(WhyTrustBand, null), /*#__PURE__*/React.createElement(Testimonials, null), /*#__PURE__*/React.createElement(FinancingStrip, {
    onNavigate: onNavigate
  }), /*#__PURE__*/React.createElement(FinalCta, {
    onNavigate: onNavigate
  }));
}

// --- About -----------------------------------------------------------------
const TIMELINE = [{
  year: '2017',
  title: 'Bay opens in Salem',
  body: 'Started in a single-bay shop on Kashmir Way SE. Three services on day one: vinyl wraps, vehicle tint, and a sign-and-go gift-card box on the counter.'
}, {
  year: '2019',
  title: 'PPF certification + second bay',
  body: 'XPEL certified-installer training. Added a second install bay so back-to-back wraps stopped colliding with PPF jobs.'
}, {
  year: '2022',
  title: 'Storefronts + commercial fleet',
  body: 'First multi-vehicle fleet wrap (8 cargo vans). Storefronts and dimensional letters added to the menu.'
}, {
  year: '2024',
  title: 'Color-change wraps + ceramic upgrade',
  body: 'Ceramic tint replaces dyed as the default tint film. Color-change category formalized with a curated brand palette.'
}];
const TRUST_STATS = [{
  value: '8+',
  label: 'Years on Kashmir Way'
}, {
  value: '1,200+',
  label: 'Vehicles wrapped'
}, {
  value: '5★',
  label: 'Google rating'
}, {
  value: '250k',
  label: 'Sq ft of vinyl installed'
}];
function AboutPage({
  onNavigate
}) {
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("section", {
    style: {
      margin: '0 auto',
      maxWidth: 896,
      padding: '96px 24px'
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 12,
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.22em',
      color: '#00AEEF'
    }
  }, "About"), /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: '12px 0 0',
      fontSize: 'clamp(36px, 5vw, 60px)',
      fontWeight: 700,
      lineHeight: 1.1,
      letterSpacing: '-0.02em',
      color: '#FFFFFF'
    }
  }, "Independent shop. Real installers. Salem-built."), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '24px 0 0',
      maxWidth: 640,
      fontSize: 18,
      lineHeight: 1.6,
      color: '#9CA3AF'
    }
  }, "Alpha Wolf Decals is a single-shop crew on Kashmir Way SE in Salem, Oregon. We wrap personal vehicles, tint daily drivers, install paint protection film on new builds, and brand commercial fleets and storefronts across the Mid-Willamette Valley.")), /*#__PURE__*/React.createElement("section", {
    "aria-label": "Trust signals",
    style: {
      borderTop: '1px solid #1A1A1A',
      borderBottom: '1px solid #1A1A1A',
      background: '#000000',
      padding: '64px 0'
    }
  }, /*#__PURE__*/React.createElement("dl", {
    style: {
      margin: '0 auto',
      maxWidth: 1280,
      padding: '0 24px',
      display: 'grid',
      gridTemplateColumns: 'repeat(4, 1fr)',
      gap: 40
    }
  }, TRUST_STATS.map(s => /*#__PURE__*/React.createElement("div", {
    key: s.label
  }, /*#__PURE__*/React.createElement("dd", {
    style: {
      margin: 0
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontFamily: 'var(--font-mono)',
      fontSize: 36,
      fontWeight: 700,
      letterSpacing: '-0.02em',
      color: '#FFFFFF',
      lineHeight: 1
    }
  }, s.value), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '8px 0 0',
      fontSize: 11,
      textTransform: 'uppercase',
      letterSpacing: '0.18em',
      color: '#8B92A0'
    }
  }, s.label)))))), /*#__PURE__*/React.createElement("section", {
    "aria-label": "Shop timeline",
    style: {
      margin: '0 auto',
      maxWidth: 896,
      padding: '96px 24px'
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 12,
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.22em',
      color: '#00AEEF'
    }
  }, "Shop story"), /*#__PURE__*/React.createElement("h2", {
    style: {
      margin: '12px 0 0',
      fontSize: 'clamp(28px, 4vw, 44px)',
      fontWeight: 700,
      lineHeight: 1.1,
      letterSpacing: '-0.02em',
      color: '#FFFFFF'
    }
  }, "From a single-bay shop to a full-service install floor."), /*#__PURE__*/React.createElement("ol", {
    style: {
      margin: '48px 0 0',
      padding: 0,
      listStyle: 'none',
      display: 'flex',
      flexDirection: 'column',
      gap: 32
    }
  }, TIMELINE.map(e => /*#__PURE__*/React.createElement("li", {
    key: e.year,
    style: {
      display: 'grid',
      gridTemplateColumns: '120px 1fr',
      gap: 16
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontFamily: 'var(--font-mono)',
      fontSize: 22,
      fontWeight: 700,
      letterSpacing: '-0.02em',
      color: '#00AEEF'
    }
  }, e.year), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: 0,
      fontSize: 18,
      fontWeight: 600,
      color: '#FFFFFF',
      lineHeight: 1.2
    }
  }, e.title), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '8px 0 0',
      fontSize: 15,
      lineHeight: 1.6,
      color: '#9CA3AF'
    }
  }, e.body)))))), /*#__PURE__*/React.createElement("section", {
    style: {
      margin: '0 auto',
      maxWidth: 896,
      padding: '0 24px 96px',
      display: 'flex',
      flexWrap: 'wrap',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    size: "lg",
    href: "/quote",
    onClick: e => {
      e.preventDefault();
      onNavigate?.('/quote');
    }
  }, "Get a quote"), /*#__PURE__*/React.createElement(Button, {
    variant: "outline",
    size: "lg",
    href: "/gallery",
    onClick: e => {
      e.preventDefault();
      onNavigate?.('/gallery');
    }
  }, "See recent shop work"), /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    size: "lg",
    href: "/contact",
    onClick: e => {
      e.preventDefault();
      onNavigate?.('/contact');
    }
  }, "Visit the shop")));
}

// --- Service detail (one minimal layout) ----------------------------------
function ServiceDetailPage({
  slug,
  onNavigate
}) {
  const svc = SERVICES.find(s => s.slug === slug) || SERVICES[0];
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("section", {
    style: {
      position: 'relative',
      borderBottom: '1px solid #1A1A1A',
      background: '#000000',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    "aria-hidden": true,
    style: {
      position: 'absolute',
      inset: 0,
      background: 'radial-gradient(50% 60% at 75% 50%, rgba(0,174,239,0.18) 0%, rgba(0,0,0,0) 70%)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      margin: '0 auto',
      maxWidth: 1280,
      padding: '64px 24px 96px',
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 48,
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 12,
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.22em',
      color: '#00AEEF'
    }
  }, svc.eyebrow), /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: '16px 0 0',
      fontSize: 'clamp(40px, 6vw, 72px)',
      fontWeight: 700,
      lineHeight: 1,
      letterSpacing: '-0.02em',
      color: '#FFFFFF'
    }
  }, svc.label), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '24px 0 0',
      fontSize: 18,
      color: '#9CA3AF',
      lineHeight: 1.55,
      maxWidth: 480
    }
  }, svc.description), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: 12,
      marginTop: 32
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    size: "lg",
    href: "/quote",
    onClick: e => {
      e.preventDefault();
      onNavigate?.('/quote');
    }
  }, "Quote this job"), /*#__PURE__*/React.createElement(Button, {
    variant: "outline",
    size: "lg",
    href: "/gallery",
    onClick: e => {
      e.preventDefault();
      onNavigate?.('/gallery');
    }
  }, "See examples"))), /*#__PURE__*/React.createElement("div", {
    style: {
      borderRadius: 8,
      border: '1px solid #1A1A1A',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement(ServiceArt, {
    slug: svc.slug
  })))), /*#__PURE__*/React.createElement("section", {
    style: {
      background: '#0A0A0A',
      padding: '80px 0'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      margin: '0 auto',
      maxWidth: 1280,
      padding: '0 24px'
    }
  }, /*#__PURE__*/React.createElement(SectionHeading, {
    eyebrow: "How it goes",
    title: "A four-step process \u2014 no hand-offs.",
    lede: "Quote, design, install, ship-out. Same hands on every step."
  }), /*#__PURE__*/React.createElement("ol", {
    style: {
      margin: '48px 0 0',
      padding: 0,
      listStyle: 'none',
      display: 'grid',
      gridTemplateColumns: 'repeat(4, 1fr)',
      gap: 16
    }
  }, [{
    n: '01',
    t: 'Quote',
    d: 'Send photos and the vehicle. We quote within one business day.'
  }, {
    n: '02',
    t: 'Design',
    d: 'AI-assisted mockups + revision rounds until you sign off.'
  }, {
    n: '03',
    t: 'Install',
    d: 'Job book locked in writing. Vehicle drops off, work happens in-bay.'
  }, {
    n: '04',
    t: 'Hand-off',
    d: 'Walk-around, care guide, and a photo for the wall.'
  }].map(s => /*#__PURE__*/React.createElement("li", {
    key: s.n,
    style: {
      borderRadius: 8,
      border: '1px solid #1A1A1A',
      background: '#000000',
      padding: 24
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontFamily: 'var(--font-mono)',
      fontSize: 13,
      color: '#00AEEF',
      letterSpacing: '0.18em'
    }
  }, s.n), /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: '12px 0 0',
      fontSize: 18,
      fontWeight: 600,
      color: '#FFFFFF'
    }
  }, s.t), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '8px 0 0',
      fontSize: 13,
      color: '#9CA3AF',
      lineHeight: 1.55
    }
  }, s.d)))))));
}

// --- Stub page for /quote /book /contact /gallery /faq /financing --------
function StubPage({
  path
}) {
  const titles = {
    '/quote': 'Get a Quote',
    '/book': 'Book Now',
    '/contact': 'Visit the shop',
    '/gallery': 'Recent shop work',
    '/faq': 'Questions, answered',
    '/financing': '0% financing'
  };
  const title = titles[path] || path;
  return /*#__PURE__*/React.createElement("section", {
    style: {
      minHeight: '60vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 560,
      padding: '64px 24px',
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 12,
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.22em',
      color: '#00AEEF'
    }
  }, "UI Kit \xB7 stub"), /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: '12px 0 0',
      fontSize: 40,
      fontWeight: 700,
      letterSpacing: '-0.02em',
      color: '#FFFFFF'
    }
  }, title), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '16px 0 0',
      fontSize: 16,
      color: '#9CA3AF',
      lineHeight: 1.55
    }
  }, "This route exists in the production codebase. The UI kit ships the homepage / about / service-detail layouts as live examples; everything else is a routing stub for click-through purposes.")));
}
Object.assign(window, {
  HomePage,
  AboutPage,
  ServiceDetailPage,
  StubPage
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/marketing/pages.jsx", error: String((e && e.message) || e) }); }

// ui_kits/marketing/sections.jsx
try { (() => {
// Marketing-page sections — Hero, ServicesGrid, WhyTrustBand,
// Testimonials, FinancingStrip, FinalCta. Re-creations of
// components/sections/*.tsx from the AlphaWolfDecals codebase, with
// the same composition and motion choices.

const {
  useEffect,
  useRef,
  useState
} = React;

// --- Hero ------------------------------------------------------------------
function Hero({
  onNavigate
}) {
  return /*#__PURE__*/React.createElement("section", {
    style: {
      position: 'relative',
      display: 'flex',
      flexDirection: 'column',
      background: '#000000',
      color: '#FFFFFF'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      width: '100%',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      width: '100%',
      aspectRatio: '21/9',
      maxHeight: '60vh',
      background: '#000000'
    }
  }, /*#__PURE__*/React.createElement("video", {
    src: "../../assets/hero.mp4",
    autoPlay: true,
    muted: true,
    loop: true,
    playsInline: true,
    preload: "metadata",
    "aria-hidden": "true",
    style: {
      position: 'absolute',
      inset: 0,
      width: '100%',
      height: '100%',
      objectFit: 'cover'
    }
  }), /*#__PURE__*/React.createElement("div", {
    "aria-hidden": true,
    style: {
      position: 'absolute',
      inset: 'auto 0 0 0',
      height: 96,
      background: 'linear-gradient(to bottom, transparent, #000000)',
      pointerEvents: 'none'
    }
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      margin: '0 auto',
      display: 'flex',
      width: '100%',
      maxWidth: 1280,
      flexDirection: 'column',
      padding: '64px 24px 96px'
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 12,
      textTransform: 'uppercase',
      letterSpacing: '0.30em',
      color: '#00AEEF',
      margin: 0
    }
  }, "Salem, Oregon"), /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: '20px 0 0',
      maxWidth: 960,
      fontSize: 'clamp(56px, 7.5vw, 96px)',
      lineHeight: 0.95,
      letterSpacing: '-0.02em',
      color: '#FFFFFF',
      fontWeight: 400
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      fontWeight: 300
    }
  }, "Don\u2019t Blend In."), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-block',
      position: 'relative',
      marginTop: 8,
      fontWeight: 700
    }
  }, "Lead the Pack.", /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      left: 0,
      bottom: -8,
      height: 3,
      width: '100%',
      background: '#00AEEF',
      transformOrigin: 'left center',
      animation: 'awd-underline-draw 400ms cubic-bezier(0.32, 0.72, 0, 1) 400ms forwards',
      transform: 'scaleX(0)'
    }
  }))), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '32px 0 0',
      maxWidth: 600,
      fontSize: 18,
      lineHeight: 1.55,
      color: '#9CA3AF'
    }
  }, "Vinyl wraps, ceramic tint, paint protection film, and storefront signage from a single shop floor in Salem, Oregon."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: 12,
      marginTop: 40
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    size: "lg",
    href: "/quote",
    onClick: e => {
      e.preventDefault();
      onNavigate?.('/quote');
    }
  }, "Get a Quote"), /*#__PURE__*/React.createElement(Button, {
    variant: "outline",
    size: "lg",
    href: "/book",
    onClick: e => {
      e.preventDefault();
      onNavigate?.('/book');
    }
  }, "Book Now")), /*#__PURE__*/React.createElement("a", {
    href: "#after-hero",
    onClick: e => e.preventDefault(),
    style: {
      display: 'inline-flex',
      flexDirection: 'column',
      alignItems: 'flex-start',
      gap: 8,
      marginTop: 48,
      color: '#8B92A0',
      textDecoration: 'none'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 24 24",
    width: "20",
    height: "20",
    fill: "currentColor"
  }, /*#__PURE__*/React.createElement("ellipse", {
    cx: "6.5",
    cy: "9",
    rx: "1.6",
    ry: "2.2"
  }), /*#__PURE__*/React.createElement("ellipse", {
    cx: "10.5",
    cy: "6",
    rx: "1.6",
    ry: "2.2"
  }), /*#__PURE__*/React.createElement("ellipse", {
    cx: "13.5",
    cy: "6",
    rx: "1.6",
    ry: "2.2"
  }), /*#__PURE__*/React.createElement("ellipse", {
    cx: "17.5",
    cy: "9",
    rx: "1.6",
    ry: "2.2"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M12 11.5c-2.8 0-5.2 2.2-5.2 4.6 0 1.6 1.4 2.4 2.6 2.4.9 0 1.6-.4 2.6-.4s1.7.4 2.6.4c1.2 0 2.6-.8 2.6-2.4 0-2.4-2.4-4.6-5.2-4.6Z"
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 10,
      textTransform: 'uppercase',
      letterSpacing: '0.30em'
    }
  }, "Scroll"))));
}

// --- ServicesGrid ----------------------------------------------------------
const SERVICES = [{
  slug: 'vinyl-wraps',
  eyebrow: 'Personal',
  label: 'Vinyl Wraps',
  description: 'Personal-vehicle wraps in any finish.',
  href: '/services/vinyl-wraps'
}, {
  slug: 'commercial-wraps',
  eyebrow: 'Fleet',
  label: 'Commercial Wraps',
  description: 'Fleet, vans, trailers, and work-truck graphics that survive the install bay and the freeway.',
  href: '/services/commercial-wraps'
}, {
  slug: 'vehicle-tint',
  eyebrow: 'Tint',
  label: 'Vehicle Tint',
  description: 'Ceramic and dyed window tint, installed to the legal limit.',
  href: '/services/vehicle-tint'
}, {
  slug: 'paint-protection-film',
  eyebrow: 'PPF',
  label: 'Paint Protection Film',
  description: 'XPEL and STEK PPF with self-healing topcoat — for new builds and the road-trip rig.',
  href: '/services/paint-protection-film'
}, {
  slug: 'color-change-wraps',
  eyebrow: 'Color change',
  label: 'Color-Change Wraps',
  description: 'Reversible color over factory paint — no resale hit, no commit.',
  href: '/services/color-change-wraps'
}, {
  slug: 'storefronts-signage',
  eyebrow: 'Signage',
  label: 'Storefronts & Signage',
  description: 'Storefront windows, building wraps, banners — designed and installed.',
  href: '/services/storefronts-signage'
}];
function ServicesGrid({
  onNavigate
}) {
  return /*#__PURE__*/React.createElement("section", {
    id: "after-hero",
    "aria-label": "Our services",
    style: {
      position: 'relative',
      background: '#0A0A0A',
      padding: '80px 0 112px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      margin: '0 auto',
      maxWidth: 1280,
      padding: '0 24px'
    }
  }, /*#__PURE__*/React.createElement(SectionHeading, {
    eyebrow: "What we do",
    title: "Six disciplines, one shop floor.",
    lede: "Personal wraps, fleet graphics, ceramic tint, paint protection film, color-change wraps, and storefront signage. Designed, printed, and installed under one roof in Salem."
  }), /*#__PURE__*/React.createElement("ul", {
    style: {
      marginTop: 48,
      padding: 0,
      listStyle: 'none',
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gap: 16
    }
  }, SERVICES.map(s => /*#__PURE__*/React.createElement("li", {
    key: s.slug
  }, /*#__PURE__*/React.createElement(ServiceCard, {
    service: s,
    onNavigate: onNavigate
  }))))));
}
function ServiceCard({
  service,
  onNavigate
}) {
  const [hover, setHover] = useState(false);
  return /*#__PURE__*/React.createElement("a", {
    href: service.href,
    onClick: e => {
      e.preventDefault();
      onNavigate?.(service.href);
    },
    style: {
      display: 'flex',
      flexDirection: 'column',
      borderRadius: 8,
      border: '1px solid ' + (hover ? 'rgba(0,174,239,0.6)' : '#1A1A1A'),
      background: '#000000',
      overflow: 'hidden',
      textDecoration: 'none',
      color: 'inherit',
      transform: hover ? 'translateY(-4px)' : 'none',
      boxShadow: hover ? '0 0 0 1px rgba(0,174,239,0.2), 0 24px 48px -24px rgba(0,174,239,0.45)' : 'none',
      transition: 'transform 300ms cubic-bezier(0.32, 0.72, 0, 1), border-color 300ms, box-shadow 300ms'
    },
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false)
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      transition: 'transform 500ms cubic-bezier(0.32, 0.72, 0, 1)',
      transform: hover ? 'scale(1.04)' : 'none'
    }
  }, /*#__PURE__*/React.createElement(ServiceArt, {
    slug: service.slug
  })), /*#__PURE__*/React.createElement("div", {
    "aria-hidden": true,
    style: {
      position: 'absolute',
      inset: 'auto 0 0 0',
      height: 48,
      background: 'linear-gradient(to bottom, transparent, #000000)',
      pointerEvents: 'none'
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flex: 1,
      flexDirection: 'column',
      gap: 8,
      padding: 24
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 11,
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.22em',
      color: '#00AEEF'
    }
  }, service.eyebrow), /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: 0,
      fontSize: 26,
      fontWeight: 600,
      lineHeight: 1.15,
      letterSpacing: '-0.01em',
      color: '#FFFFFF'
    }
  }, service.label), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 14,
      lineHeight: 1.55,
      color: '#9CA3AF'
    }
  }, service.description), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '12px 0 0',
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8,
      fontSize: 14,
      fontWeight: 600,
      color: '#00AEEF'
    }
  }, /*#__PURE__*/React.createElement("span", null, "Explore"), /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 16 16",
    width: "12",
    height: "12",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.75",
    strokeLinecap: "round",
    style: {
      transition: 'transform 300ms',
      transform: hover ? 'translateX(4px)' : 'none'
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: "M3 8h10M9 4l4 4-4 4"
  })))));
}

// --- WhyTrustBand ----------------------------------------------------------
const STATS = [{
  value: 8,
  suffix: '+',
  label: 'Years on the shop floor'
}, {
  value: 1200,
  suffix: '+',
  label: 'Vehicles wrapped, tinted, or filmed'
}, {
  value: 5,
  suffix: '★',
  label: 'Average Google review rating'
}, {
  value: 250,
  suffix: 'k',
  label: 'Square feet of vinyl installed'
}];
function easeOutQuart(t) {
  return 1 - Math.pow(1 - t, 4);
}
function Stat({
  value,
  suffix,
  label
}) {
  const [current, setCurrent] = useState(0);
  useEffect(() => {
    const start = performance.now();
    let raf = 0;
    function tick(now) {
      const p = Math.min(1, (now - start) / 1500);
      setCurrent(Math.round(value * easeOutQuart(p)));
      if (p < 1) raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontFamily: 'var(--font-mono)',
      fontSize: 'clamp(48px, 6vw, 72px)',
      fontWeight: 700,
      lineHeight: 0.95,
      letterSpacing: '-0.02em',
      color: '#FFFFFF'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontVariantNumeric: 'tabular-nums'
    }
  }, current.toLocaleString('en-US')), /*#__PURE__*/React.createElement("span", {
    style: {
      color: '#00AEEF'
    }
  }, suffix)), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 13,
      textTransform: 'uppercase',
      letterSpacing: '0.18em',
      color: '#8B92A0'
    }
  }, label));
}
function WhyTrustBand() {
  return /*#__PURE__*/React.createElement("section", {
    "aria-label": "Why Alpha Wolf",
    style: {
      position: 'relative',
      background: '#000000',
      padding: '80px 0 112px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      margin: '0 auto',
      maxWidth: 1280,
      padding: '0 24px'
    }
  }, /*#__PURE__*/React.createElement(SectionHeading, {
    eyebrow: "Why Alpha Wolf",
    title: "A shop floor that earns its hours.",
    lede: "Numbers that come from a real install bay, not stock-photo claims. Confirmed against the shop's own records."
  }), /*#__PURE__*/React.createElement("dl", {
    style: {
      marginTop: 64,
      display: 'grid',
      gridTemplateColumns: 'repeat(4, 1fr)',
      gap: 40,
      padding: 0
    }
  }, STATS.map(s => /*#__PURE__*/React.createElement("div", {
    key: s.label
  }, /*#__PURE__*/React.createElement("dt", {
    style: {
      position: 'absolute',
      width: 1,
      height: 1,
      padding: 0,
      margin: -1,
      overflow: 'hidden',
      clip: 'rect(0,0,0,0)'
    }
  }, s.label), /*#__PURE__*/React.createElement("dd", {
    style: {
      margin: 0
    }
  }, /*#__PURE__*/React.createElement(Stat, s)))))));
}

// --- Testimonials ----------------------------------------------------------
const TESTIMONIALS = [{
  author: 'Marco R.',
  source: 'Google · Mar 2024',
  rating: 5,
  body: 'Brought in our 8-van fleet over two weeks. Every install came back identical — same logo placement, same edges. Zero re-do.'
}, {
  author: 'Cassidy L.',
  source: 'Google · Jan 2024',
  rating: 5,
  body: 'Color change from arctic-white to satin charcoal. Two and a half days. Pulled off perfectly, came home with a different car.'
}, {
  author: 'Mike & Jenna H.',
  source: 'Google · Nov 2023',
  rating: 5,
  body: 'Storefront vinyl + full window graphics for our new Salem location. They quoted, designed, and installed without us chasing.'
}];
function StarIcon({
  filled
}) {
  return /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 24 24",
    width: "16",
    height: "16",
    fill: filled ? '#00AEEF' : '#2A2A2A'
  }, /*#__PURE__*/React.createElement("path", {
    d: "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
  }));
}
function Testimonials() {
  return /*#__PURE__*/React.createElement("section", {
    "aria-label": "Customer testimonials",
    style: {
      position: 'relative',
      background: '#0A0A0A',
      padding: '80px 0 112px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      margin: '0 auto',
      maxWidth: 1280,
      padding: '0 24px'
    }
  }, /*#__PURE__*/React.createElement(SectionHeading, {
    eyebrow: "What customers say",
    title: "Real reviews from real installs.",
    lede: "Verified Google reviews from Salem-area customers: wraps, tint, PPF, and signage."
  }), /*#__PURE__*/React.createElement("ul", {
    style: {
      marginTop: 48,
      padding: 0,
      listStyle: 'none',
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gap: 16
    }
  }, TESTIMONIALS.map(t => /*#__PURE__*/React.createElement("li", {
    key: t.author
  }, /*#__PURE__*/React.createElement("article", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 16,
      height: '100%',
      borderRadius: 8,
      border: '1px solid #1A1A1A',
      background: '#000000',
      padding: 24
    }
  }, /*#__PURE__*/React.createElement("div", {
    role: "img",
    "aria-label": `${t.rating} out of 5 stars`,
    style: {
      display: 'inline-flex',
      gap: 4
    }
  }, Array.from({
    length: 5
  }).map((_, i) => /*#__PURE__*/React.createElement(StarIcon, {
    key: i,
    filled: i < t.rating
  }))), /*#__PURE__*/React.createElement("blockquote", {
    style: {
      margin: 0,
      fontSize: 15,
      lineHeight: 1.6,
      color: '#FFFFFF'
    }
  }, "\"", t.body, "\""), /*#__PURE__*/React.createElement("footer", {
    style: {
      marginTop: 'auto',
      display: 'flex',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: 12,
      borderTop: '1px solid #1A1A1A',
      paddingTop: 16,
      fontSize: 11
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.18em',
      color: '#FFFFFF'
    }
  }, t.author), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontFamily: 'var(--font-mono)',
      color: '#8B92A0'
    }
  }, t.source))))))));
}

// --- FinancingStrip --------------------------------------------------------
function FinancingStrip({
  onNavigate
}) {
  return /*#__PURE__*/React.createElement("section", {
    style: {
      background: '#000000',
      padding: '64px 0'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      margin: '0 auto',
      maxWidth: 1280,
      padding: '0 24px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 32,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      maxWidth: 720
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 11,
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.22em',
      color: '#00AEEF'
    }
  }, "0% financing available"), /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: 0,
      fontSize: 28,
      fontWeight: 700,
      color: '#FFFFFF',
      lineHeight: 1.1,
      letterSpacing: '-0.01em'
    }
  }, "Wrap now, pay over 12 \u2014 no interest."), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 14,
      color: '#9CA3AF',
      maxWidth: 560
    }
  }, "Soft pull at checkout, decisions in under a minute. Available on jobs $500 and up.")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    size: "default",
    href: "/financing",
    onClick: e => {
      e.preventDefault();
      onNavigate?.('/financing');
    }
  }, "Apply Now"), /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    size: "default",
    href: "/financing",
    onClick: e => {
      e.preventDefault();
      onNavigate?.('/financing');
    }
  }, "Learn More"))));
}

// --- FinalCta --------------------------------------------------------------
function FinalCta({
  onNavigate
}) {
  return /*#__PURE__*/React.createElement("section", {
    "aria-label": "Ready to lead the pack",
    style: {
      position: 'relative',
      overflow: 'hidden',
      background: '#000000',
      isolation: 'isolate'
    }
  }, /*#__PURE__*/React.createElement("div", {
    "aria-hidden": true,
    style: {
      position: 'absolute',
      inset: 0,
      zIndex: -1,
      background: 'radial-gradient(60% 60% at 50% 40%, rgba(0,174,239,0.18) 0%, rgba(10,10,10,0) 70%)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      margin: '0 auto',
      display: 'flex',
      maxWidth: 1024,
      flexDirection: 'column',
      alignItems: 'center',
      gap: 32,
      padding: '96px 24px 128px',
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 12,
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.30em',
      color: '#00AEEF'
    }
  }, "Salem, Oregon"), /*#__PURE__*/React.createElement("h2", {
    style: {
      margin: 0,
      fontFamily: 'var(--font-sans)',
      fontSize: 'clamp(44px, 6vw, 80px)',
      fontWeight: 700,
      lineHeight: 0.95,
      letterSpacing: '-0.02em',
      color: '#FFFFFF'
    }
  }, "Ready to ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: '#00AEEF'
    }
  }, "Lead the Pack?")), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      maxWidth: 560,
      fontSize: 18,
      lineHeight: 1.55,
      color: '#9CA3AF'
    }
  }, "Free quotes, transparent pricing, and a single shop floor that sees the project from quote to install. Reach out \u2014 we'll take it from there."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: 12,
      justifyContent: 'center',
      marginTop: 8
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    size: "lg",
    href: "/quote",
    onClick: e => {
      e.preventDefault();
      onNavigate?.('/quote');
    }
  }, "Get a Quote"), /*#__PURE__*/React.createElement(Button, {
    variant: "outline",
    size: "lg",
    href: "/book",
    onClick: e => {
      e.preventDefault();
      onNavigate?.('/book');
    }
  }, "Book Now"))));
}
Object.assign(window, {
  Hero,
  ServicesGrid,
  ServiceCard,
  WhyTrustBand,
  Testimonials,
  FinancingStrip,
  FinalCta,
  SERVICES,
  TESTIMONIALS
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/marketing/sections.jsx", error: String((e && e.message) || e) }); }

// ui_kits/marketing/service-art.jsx
try { (() => {
// Per-service art for the homepage services grid — real install photos
// from the shop's gallery (lib/gallery.ts in archerverified/AlphaWolfDecals).
// Each image is the literal output of the service the card promotes.

const SERVICE_PHOTO = {
  'vinyl-wraps': {
    src: '../../assets/gallery/14.jpg',
    alt: 'Buick Enclave Avenir after a green-shift vinyl wrap, parked at the shop.'
  },
  'commercial-wraps': {
    src: '../../assets/gallery/15.jpg',
    alt: 'ChemDry of Corvallis fleet van — full-body commercial wrap from the install bay.'
  },
  'vehicle-tint': {
    src: '../../assets/gallery/16.jpg',
    alt: 'Toyota Tundra TRD Pro with ceramic window tint installed.'
  },
  'paint-protection-film': {
    src: '../../assets/gallery/17.jpg',
    alt: 'Tesla Model 3 hood mid-install with PPF / clear-bra slip-water on the surface.'
  },
  'color-change-wraps': {
    src: '../../assets/gallery/09.jpg',
    alt: '2022 Chevrolet Camaro RS after a satin plum color-change wrap.'
  },
  'storefronts-signage': {
    src: '../../assets/gallery/25.jpg',
    alt: "Ohana's Barbershop — custom storefront window vinyl and channel-letter sign."
  }
};
function ServiceArt({
  slug
}) {
  const photo = SERVICE_PHOTO[slug] || SERVICE_PHOTO['vinyl-wraps'];
  return /*#__PURE__*/React.createElement("div", {
    "aria-hidden": "true",
    style: {
      position: 'relative',
      aspectRatio: '4/3',
      width: '100%',
      overflow: 'hidden',
      background: '#0A0A0A'
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: photo.src,
    alt: photo.alt,
    style: {
      position: 'absolute',
      inset: 0,
      width: '100%',
      height: '100%',
      objectFit: 'cover',
      display: 'block'
    }
  }));
}
Object.assign(window, {
  ServiceArt,
  SERVICE_PHOTO
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/marketing/service-art.jsx", error: String((e && e.message) || e) }); }

// ui_kits/wrap_studio/components.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
// Wrap Studio primitives — zinc-neutral, light-surface shadcn-derived.
// Direct re-creations of packages/ui/src/components/ui/* and the inline
// patterns used across apps/web/.

const {
  forwardRef,
  useEffect,
  useRef,
  useState
} = React;
function cx(...parts) {
  return parts.filter(Boolean).join(' ');
}

// --- Button ----------------------------------------------------------------
const awsBtnBase = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  whiteSpace: 'nowrap',
  borderRadius: 6,
  fontFamily: 'var(--font-sans)',
  fontWeight: 500,
  transition: 'background-color 150ms, border-color 150ms',
  textDecoration: 'none',
  cursor: 'pointer',
  border: '1px solid transparent',
  lineHeight: 1,
  boxSizing: 'border-box'
};
const awsBtnVariants = {
  primary: {
    background: '#18181B',
    color: '#FFFFFF',
    boxShadow: '0 1px 2px rgba(0,0,0,.05)'
  },
  outline: {
    background: '#FFFFFF',
    color: '#18181B',
    borderColor: '#D4D4D8',
    boxShadow: '0 1px 2px rgba(0,0,0,.05)'
  },
  secondary: {
    background: '#F4F4F5',
    color: '#18181B'
  },
  ghost: {
    background: 'transparent',
    color: '#27272A'
  },
  destructive: {
    background: '#DC2626',
    color: '#FFFFFF'
  },
  link: {
    background: 'transparent',
    color: '#18181B',
    padding: 0,
    height: 'auto'
  }
};
const awsBtnHover = {
  primary: {
    background: '#27272A'
  },
  outline: {
    background: '#FAFAFA'
  },
  secondary: {
    background: '#E4E4E7'
  },
  ghost: {
    background: '#F4F4F5'
  },
  destructive: {
    background: '#B91C1C'
  },
  link: {}
};
const awsBtnSizes = {
  default: {
    height: 36,
    padding: '0 16px',
    fontSize: 13
  },
  sm: {
    height: 32,
    padding: '0 12px',
    fontSize: 12
  },
  lg: {
    height: 40,
    padding: '0 24px',
    fontSize: 14
  },
  icon: {
    height: 36,
    width: 36,
    padding: 0
  }
};
function AwsButton({
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
    ...awsBtnBase,
    ...awsBtnSizes[size],
    ...awsBtnVariants[variant],
    ...(hover ? awsBtnHover[variant] : {}),
    ...style
  };
  if (href !== undefined) As = 'a';
  return /*#__PURE__*/React.createElement(As, _extends({
    href: href,
    onClick: onClick,
    style: merged,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false)
  }, rest), children);
}

// --- Eyebrow ---------------------------------------------------------------
function Eyebrow({
  children,
  style
}) {
  return /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 11,
      fontWeight: 500,
      textTransform: 'uppercase',
      letterSpacing: '0.10em',
      color: '#71717A',
      ...style
    }
  }, children);
}

// --- Label & Input ---------------------------------------------------------
function Label({
  htmlFor,
  children
}) {
  return /*#__PURE__*/React.createElement("label", {
    htmlFor: htmlFor,
    style: {
      fontSize: 13,
      fontWeight: 500,
      color: '#27272A'
    }
  }, children);
}
function Input({
  id,
  error,
  style,
  ...rest
}) {
  const [focus, setFocus] = useState(false);
  return /*#__PURE__*/React.createElement("input", _extends({
    id: id,
    onFocus: () => setFocus(true),
    onBlur: () => setFocus(false),
    style: {
      height: 36,
      width: '100%',
      boxSizing: 'border-box',
      borderRadius: 6,
      border: '1px solid ' + (error ? '#FCA5A5' : focus ? '#18181B' : '#D4D4D8'),
      padding: '0 12px',
      fontSize: 14,
      color: '#18181B',
      background: '#FFFFFF',
      boxShadow: focus ? '0 0 0 3px rgba(228,228,231,0.65)' : '0 1px 2px rgba(0,0,0,.05)',
      outline: 'none',
      fontFamily: 'inherit',
      transition: 'border-color 150ms, box-shadow 150ms',
      ...style
    }
  }, rest));
}
function Select({
  id,
  disabled,
  value,
  onChange,
  options,
  placeholder
}) {
  const [focus, setFocus] = useState(false);
  return /*#__PURE__*/React.createElement("select", {
    id: id,
    disabled: disabled,
    value: value,
    onChange: e => onChange?.(e.target.value),
    onFocus: () => setFocus(true),
    onBlur: () => setFocus(false),
    style: {
      height: 36,
      width: '100%',
      boxSizing: 'border-box',
      borderRadius: 6,
      border: '1px solid ' + (focus ? '#18181B' : '#D4D4D8'),
      padding: '0 12px',
      fontSize: 14,
      background: disabled ? '#F4F4F5' : '#FFFFFF',
      color: disabled ? '#A1A1AA' : '#18181B',
      cursor: disabled ? 'not-allowed' : 'pointer',
      boxShadow: focus ? '0 0 0 3px rgba(228,228,231,0.65)' : '0 1px 2px rgba(0,0,0,.05)',
      outline: 'none',
      fontFamily: 'inherit',
      transition: 'border-color 150ms, box-shadow 150ms'
    }
  }, /*#__PURE__*/React.createElement("option", {
    value: ""
  }, placeholder), (options || []).map(o => /*#__PURE__*/React.createElement("option", {
    key: o.value,
    value: o.value
  }, o.label)));
}

// --- Card ------------------------------------------------------------------
function AwsCard({
  children,
  dashed,
  hoverable,
  style,
  ...rest
}) {
  const [hover, setHover] = useState(false);
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      background: '#FFFFFF',
      borderRadius: 12,
      border: '1px solid #E4E4E7',
      borderStyle: dashed ? 'dashed' : 'solid',
      boxShadow: hoverable && hover ? '0 4px 6px -1px rgba(0,0,0,.1), 0 2px 4px -2px rgba(0,0,0,.05)' : '0 1px 3px rgba(0,0,0,.08), 0 1px 2px -1px rgba(0,0,0,.05)',
      transition: 'box-shadow 200ms',
      ...style
    },
    onMouseEnter: () => hoverable && setHover(true),
    onMouseLeave: () => hoverable && setHover(false)
  }, rest), children);
}

// --- Toast (sonner-style) --------------------------------------------------
function Toast({
  kind = 'success',
  children
}) {
  const palette = {
    success: {
      bg: '#ECFDF5',
      bd: '#A7F3D0',
      fg: '#064E3B'
    },
    danger: {
      bg: '#FEF2F2',
      bd: '#FECACA',
      fg: '#7F1D1D'
    },
    warning: {
      bg: '#FFFBEB',
      bd: '#FDE68A',
      fg: '#78350F'
    }
  }[kind] || {
    bg: '#FFFFFF',
    bd: '#E4E4E7',
    fg: '#27272A'
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      borderRadius: 8,
      padding: '10px 14px',
      fontSize: 13,
      fontWeight: 500,
      background: palette.bg,
      border: '1px solid ' + palette.bd,
      color: palette.fg,
      boxShadow: '0 4px 6px -1px rgba(0,0,0,.1)'
    }
  }, children);
}

// --- Lucide-style icon wrappers (inline SVGs) ------------------------------
const I = ({
  children,
  size = 16,
  color = 'currentColor'
}) => /*#__PURE__*/React.createElement("svg", {
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: color,
  strokeWidth: "2",
  strokeLinecap: "round",
  strokeLinejoin: "round"
}, children);
const IconMousePointer = p => /*#__PURE__*/React.createElement(I, p, /*#__PURE__*/React.createElement("path", {
  d: "M3 3l7.07 16.97 2.51-7.39 7.39-2.51z"
}));
const IconType = p => /*#__PURE__*/React.createElement(I, p, /*#__PURE__*/React.createElement("path", {
  d: "M4 7V4h16v3"
}), /*#__PURE__*/React.createElement("path", {
  d: "M9 20h6"
}), /*#__PURE__*/React.createElement("path", {
  d: "M12 4v16"
}));
const IconSquare = p => /*#__PURE__*/React.createElement(I, p, /*#__PURE__*/React.createElement("rect", {
  x: "3",
  y: "3",
  width: "18",
  height: "18",
  rx: "2"
}));
const IconCircle = p => /*#__PURE__*/React.createElement(I, p, /*#__PURE__*/React.createElement("circle", {
  cx: "12",
  cy: "12",
  r: "9"
}));
const IconImage = p => /*#__PURE__*/React.createElement(I, p, /*#__PURE__*/React.createElement("rect", {
  x: "3",
  y: "3",
  width: "18",
  height: "18",
  rx: "2"
}), /*#__PURE__*/React.createElement("circle", {
  cx: "9",
  cy: "9",
  r: "2"
}), /*#__PURE__*/React.createElement("path", {
  d: "m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"
}));
const IconMagnet = p => /*#__PURE__*/React.createElement(I, p, /*#__PURE__*/React.createElement("path", {
  d: "m6 15-4-4 6.75-6.77a7.79 7.79 0 0 1 11 11L13 22l-4-4 6.39-6.36a2.14 2.14 0 0 0-3-3L6 15"
}), /*#__PURE__*/React.createElement("path", {
  d: "m5 8 4 4"
}), /*#__PURE__*/React.createElement("path", {
  d: "m12 15 4 4"
}));
const IconUndo = p => /*#__PURE__*/React.createElement(I, p, /*#__PURE__*/React.createElement("path", {
  d: "M3 7v6h6"
}), /*#__PURE__*/React.createElement("path", {
  d: "M21 17a9 9 0 1 1-3-7"
}));
const IconRedo = p => /*#__PURE__*/React.createElement(I, p, /*#__PURE__*/React.createElement("path", {
  d: "M21 7v6h-6"
}), /*#__PURE__*/React.createElement("path", {
  d: "M3 17a9 9 0 1 1 3-7"
}));
const IconCheck = p => /*#__PURE__*/React.createElement(I, p, /*#__PURE__*/React.createElement("path", {
  d: "M20 6 9 17l-5-5"
}));
const IconLoader = p => /*#__PURE__*/React.createElement(I, p, /*#__PURE__*/React.createElement("line", {
  x1: "12",
  y1: "2",
  x2: "12",
  y2: "6"
}), /*#__PURE__*/React.createElement("line", {
  x1: "12",
  y1: "18",
  x2: "12",
  y2: "22"
}), /*#__PURE__*/React.createElement("line", {
  x1: "4.93",
  y1: "4.93",
  x2: "7.76",
  y2: "7.76"
}), /*#__PURE__*/React.createElement("line", {
  x1: "16.24",
  y1: "16.24",
  x2: "19.07",
  y2: "19.07"
}));
const IconSearch = p => /*#__PURE__*/React.createElement(I, p, /*#__PURE__*/React.createElement("circle", {
  cx: "11",
  cy: "11",
  r: "8"
}), /*#__PURE__*/React.createElement("line", {
  x1: "21",
  y1: "21",
  x2: "16.65",
  y2: "16.65"
}));
const IconArrowRight = p => /*#__PURE__*/React.createElement(I, p, /*#__PURE__*/React.createElement("path", {
  d: "M5 12h14"
}), /*#__PURE__*/React.createElement("path", {
  d: "m12 5 7 7-7 7"
}));
const IconMore = p => /*#__PURE__*/React.createElement(I, p, /*#__PURE__*/React.createElement("circle", {
  cx: "12",
  cy: "12",
  r: "1"
}), /*#__PURE__*/React.createElement("circle", {
  cx: "19",
  cy: "12",
  r: "1"
}), /*#__PURE__*/React.createElement("circle", {
  cx: "5",
  cy: "12",
  r: "1"
}));
Object.assign(window, {
  cx,
  AwsButton,
  Eyebrow,
  Label,
  Input,
  Select,
  AwsCard,
  Toast,
  IconMousePointer,
  IconType,
  IconSquare,
  IconCircle,
  IconImage,
  IconMagnet,
  IconUndo,
  IconRedo,
  IconCheck,
  IconLoader,
  IconSearch,
  IconArrowRight,
  IconMore
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/wrap_studio/components.jsx", error: String((e && e.message) || e) }); }

// ui_kits/wrap_studio/editor.jsx
try { (() => {
// WrapEditor — three-pane shell modeled after components/editor/CanvasEditor.tsx.
// Tool rail (left, 56 px) · canvas host (fluid) · inspector (right, 256 px).

const {
  useState: useEditorState
} = React;
function ToolRailButton({
  active,
  label,
  icon,
  onClick
}) {
  const [hover, setHover] = useEditorState(false);
  return /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: onClick,
    "aria-label": label,
    "aria-pressed": active,
    title: label,
    style: {
      width: 36,
      height: 36,
      borderRadius: 6,
      border: 0,
      background: active ? '#F4F4F5' : hover ? '#F4F4F5' : 'transparent',
      color: '#27272A',
      cursor: 'pointer',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      transition: 'background-color 150ms'
    },
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false)
  }, icon);
}
function WrapEditor({
  vehicleLabel = '2024 Ford Transit 250 · 148″WB High Roof',
  onBack
}) {
  const [tool, setTool] = useEditorState('select');
  const [elements, setElements] = useEditorState([]);
  const [autosave, setAutosave] = useEditorState('saved');
  function add(kind) {
    const next = {
      id: 'el-' + Math.random().toString(36).slice(2, 7),
      kind,
      x: 220 + elements.length % 6 * 40,
      y: 180 + elements.length % 6 * 40
    };
    setElements(prev => [...prev, next]);
    setAutosave('saving');
    setTimeout(() => setAutosave('saved'), 700);
  }
  function clear() {
    setElements([]);
    setAutosave('saving');
    setTimeout(() => setAutosave('saved'), 400);
  }
  return /*#__PURE__*/React.createElement("div", {
    "data-screen-label": "04 Editor",
    style: {
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: '#F4F4F5',
      color: '#18181B'
    }
  }, /*#__PURE__*/React.createElement("header", {
    style: {
      display: 'flex',
      height: 48,
      flexShrink: 0,
      alignItems: 'center',
      justifyContent: 'space-between',
      borderBottom: '1px solid #E4E4E7',
      background: '#FFFFFF',
      padding: '0 16px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: onBack,
    style: {
      border: 0,
      background: 'transparent',
      padding: 6,
      borderRadius: 6,
      cursor: 'pointer',
      color: '#52525B',
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      fontSize: 12
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "14",
    height: "14",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M15 18l-6-6 6-6"
  })), "Projects"), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 1,
      height: 16,
      background: '#E4E4E7'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      fontWeight: 600,
      color: '#18181B'
    }
  }, vehicleLabel)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 6
    }
  }, /*#__PURE__*/React.createElement(ToolRailButton, {
    label: "Undo",
    icon: /*#__PURE__*/React.createElement(IconUndo, {
      size: 16
    })
  }), /*#__PURE__*/React.createElement(ToolRailButton, {
    label: "Redo",
    icon: /*#__PURE__*/React.createElement(IconRedo, {
      size: 16
    })
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 1,
      height: 16,
      background: '#E4E4E7',
      margin: '0 6px'
    }
  }), /*#__PURE__*/React.createElement("button", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      height: 28,
      padding: '0 10px',
      borderRadius: 6,
      border: 0,
      background: 'transparent',
      color: '#27272A',
      cursor: 'pointer',
      fontSize: 12
    }
  }, /*#__PURE__*/React.createElement(IconMagnet, {
    size: 14
  }), " Snap"), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 1,
      height: 16,
      background: '#E4E4E7',
      margin: '0 6px'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      minWidth: 80,
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      fontSize: 11,
      color: '#71717A'
    }
  }, autosave === 'saving' ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-block',
      width: 12,
      height: 12,
      borderRadius: '50%',
      border: '1.5px solid #E4E4E7',
      borderTopColor: '#52525B',
      animation: 'aws-spin 0.8s linear infinite'
    }
  }), " Saving\u2026") : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("span", {
    style: {
      color: '#059669',
      display: 'inline-flex'
    }
  }, /*#__PURE__*/React.createElement(IconCheck, {
    size: 14
  })), " Saved")))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      minHeight: 0,
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("nav", {
    style: {
      width: 56,
      flexShrink: 0,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 4,
      borderRight: '1px solid #E4E4E7',
      background: '#FFFFFF',
      padding: '12px 0'
    }
  }, /*#__PURE__*/React.createElement(ToolRailButton, {
    active: tool === 'select',
    label: "Select",
    icon: /*#__PURE__*/React.createElement(IconMousePointer, {
      size: 20
    }),
    onClick: () => setTool('select')
  }), /*#__PURE__*/React.createElement(ToolRailButton, {
    active: tool === 'text',
    label: "Add text",
    icon: /*#__PURE__*/React.createElement(IconType, {
      size: 20
    }),
    onClick: () => {
      setTool('text');
      add('text');
    }
  }), /*#__PURE__*/React.createElement(ToolRailButton, {
    active: tool === 'shape',
    label: "Add shape",
    icon: /*#__PURE__*/React.createElement(IconSquare, {
      size: 20
    }),
    onClick: () => {
      setTool('shape');
      add('shape');
    }
  }), /*#__PURE__*/React.createElement(ToolRailButton, {
    active: tool === 'image',
    label: "Image",
    icon: /*#__PURE__*/React.createElement(IconImage, {
      size: 20
    }),
    onClick: () => setTool('image')
  })), /*#__PURE__*/React.createElement("main", {
    style: {
      position: 'relative',
      minWidth: 0,
      flex: 1,
      background: '#E4E4E7'
    }
  }, /*#__PURE__*/React.createElement(CanvasMock, {
    elements: elements,
    onAddText: () => add('text'),
    onAddShape: () => add('shape')
  })), /*#__PURE__*/React.createElement("aside", {
    style: {
      width: 256,
      flexShrink: 0,
      display: 'flex',
      flexDirection: 'column',
      gap: 16,
      overflowY: 'auto',
      borderLeft: '1px solid #E4E4E7',
      background: '#FFFFFF',
      padding: 16
    }
  }, /*#__PURE__*/React.createElement("section", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      margin: 0,
      fontSize: 11,
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.10em',
      color: '#71717A'
    }
  }, "Upload"), /*#__PURE__*/React.createElement("div", {
    style: {
      border: '1px dashed #D4D4D8',
      borderRadius: 8,
      padding: '20px 12px',
      textAlign: 'center',
      fontSize: 12,
      color: '#71717A'
    }
  }, "Drop AI \xB7 EPS \xB7 PDF \xB7 SVG \xB7 PNG \xB7 JPG \xB7 HEIC", /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("span", {
    style: {
      color: '#A1A1AA'
    }
  }, "up to 50 MB"))), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 1,
      background: '#E4E4E7'
    }
  }), /*#__PURE__*/React.createElement("section", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      margin: 0,
      fontSize: 11,
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.10em',
      color: '#71717A'
    }
  }, "Selection"), elements.length === 0 ? /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 13,
      color: '#71717A'
    }
  }, "Nothing selected.") : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      fontSize: 13,
      color: '#3F3F46'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: '#71717A'
    }
  }, "Type"), /*#__PURE__*/React.createElement("span", {
    style: {
      textTransform: 'capitalize'
    }
  }, elements[elements.length - 1].kind)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: '#71717A'
    }
  }, "Panel"), /*#__PURE__*/React.createElement("span", null, "Driver quarter")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: '#71717A'
    }
  }, "Position"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 12
    }
  }, elements[elements.length - 1].x, ", ", elements[elements.length - 1].y))), /*#__PURE__*/React.createElement(AwsButton, {
    variant: "destructive",
    size: "sm",
    onClick: clear,
    style: {
      marginTop: 6
    }
  }, "Delete"))), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 1,
      background: '#E4E4E7'
    }
  }), /*#__PURE__*/React.createElement("section", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      margin: 0,
      fontSize: 11,
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.10em',
      color: '#71717A'
    }
  }, "Export"), /*#__PURE__*/React.createElement(AwsButton, {
    variant: "primary",
    size: "default"
  }, "Export production PDF"), /*#__PURE__*/React.createElement(AwsButton, {
    variant: "outline",
    size: "default"
  }, "Customer mockup PDF")))), /*#__PURE__*/React.createElement("style", null, `@keyframes aws-spin { to { transform: rotate(360deg); } }`));
}
function CanvasMock({
  elements,
  onAddText,
  onAddShape
}) {
  // Stage centered preview of a van outline with placed elements
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 32
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      width: '100%',
      maxWidth: 720,
      aspectRatio: '16/9',
      background: '#FFFFFF',
      border: '1px solid #D4D4D8',
      borderRadius: 8,
      boxShadow: '0 4px 12px rgba(0,0,0,.08)',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 800 450",
    style: {
      position: 'absolute',
      inset: 0,
      width: '100%',
      height: '100%'
    }
  }, /*#__PURE__*/React.createElement("g", {
    fill: "none",
    stroke: "#A1A1AA",
    strokeWidth: "1.2",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M 80 360 L 80 130 Q 80 110 105 110 L 600 110 Q 660 110 690 145 L 720 230 L 730 290 Q 732 350 715 360 Z"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "80",
    y1: "360",
    x2: "730",
    y2: "360"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "105",
    y: "125",
    width: "120",
    height: "60",
    rx: "4",
    stroke: "#D4D4D8"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "280",
    y1: "110",
    x2: "280",
    y2: "360",
    stroke: "#D4D4D8"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "460",
    y1: "110",
    x2: "460",
    y2: "360",
    stroke: "#D4D4D8"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "540",
    y: "125",
    width: "170",
    height: "100",
    rx: "4",
    stroke: "#D4D4D8"
  })), /*#__PURE__*/React.createElement("circle", {
    cx: "190",
    cy: "360",
    r: "26",
    fill: "#FFFFFF",
    stroke: "#A1A1AA",
    strokeWidth: "1.5"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "190",
    cy: "360",
    r: "11",
    fill: "#A1A1AA"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "620",
    cy: "360",
    r: "26",
    fill: "#FFFFFF",
    stroke: "#A1A1AA",
    strokeWidth: "1.5"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "620",
    cy: "360",
    r: "11",
    fill: "#A1A1AA"
  }), elements.map((el, i) => {
    if (el.kind === 'text') return /*#__PURE__*/React.createElement("text", {
      key: el.id,
      x: el.x,
      y: el.y,
      fontFamily: "var(--font-sans)",
      fontSize: "18",
      fill: "#18181B",
      fontWeight: "700"
    }, "Double-click to edit");
    if (el.kind === 'shape') return /*#__PURE__*/React.createElement("rect", {
      key: el.id,
      x: el.x,
      y: el.y - 30,
      width: "100",
      height: "60",
      fill: "#00AEEF",
      opacity: 0.6,
      rx: "3"
    });
    return null;
  }), elements.length > 0 && /*#__PURE__*/React.createElement("g", {
    transform: `translate(${elements[elements.length - 1].x - 8} ${elements[elements.length - 1].y - (elements[elements.length - 1].kind === 'shape' ? 38 : 24)})`
  }, /*#__PURE__*/React.createElement("rect", {
    width: elements[elements.length - 1].kind === 'shape' ? 116 : 220,
    height: elements[elements.length - 1].kind === 'shape' ? 76 : 32,
    fill: "none",
    stroke: "#18181B",
    strokeWidth: "1.2",
    strokeDasharray: "3 3"
  }))), elements.length === 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      pointerEvents: 'none'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      pointerEvents: 'auto',
      width: 320,
      textAlign: 'center',
      background: '#FFFFFF',
      border: '1px solid #E4E4E7',
      borderRadius: 12,
      boxShadow: '0 1px 3px rgba(0,0,0,.08)',
      padding: 24
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: 0,
      fontSize: 16,
      fontWeight: 600,
      color: '#18181B'
    }
  }, "Start your wrap"), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '8px 0 16px',
      fontSize: 13,
      color: '#52525B',
      lineHeight: 1.5
    }
  }, "Add text, a shape, or upload artwork to place it on a panel."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'center',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(AwsButton, {
    variant: "outline",
    size: "sm",
    onClick: onAddText
  }, /*#__PURE__*/React.createElement(IconType, {
    size: 14
  }), " Text"), /*#__PURE__*/React.createElement(AwsButton, {
    variant: "outline",
    size: "sm",
    onClick: onAddShape
  }, /*#__PURE__*/React.createElement(IconSquare, {
    size: 14
  }), " Shape"))))));
}
Object.assign(window, {
  WrapEditor
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/wrap_studio/editor.jsx", error: String((e && e.message) || e) }); }

// ui_kits/wrap_studio/pages.jsx
try { (() => {
// Composed Wrap Studio pages. Recreated layouts:
//   /                          -> HomePage  (the "I'm a customer" entry)
//   /signup, /signin           -> AuthPage  (with the 5-step strength meter)
//   /welcome                   -> WelcomePage
//   /vehicles/select           -> VehicleSelectPage
//   /projects                  -> ProjectsPage
//   /projects/[id]/editor      -> EditorPage

const {
  useState: usePagesState
} = React;

// --- Home (logged-out home page) ------------------------------------------
function HomePage({
  onNavigate
}) {
  return /*#__PURE__*/React.createElement("main", {
    style: {
      display: 'flex',
      minHeight: '100%',
      flex: 1,
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 24,
      padding: 32,
      background: '#FAFAFA'
    }
  }, /*#__PURE__*/React.createElement(Eyebrow, null, "Alpha Wolf Wrap Studio"), /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: 0,
      fontSize: 30,
      fontWeight: 600,
      color: '#18181B',
      letterSpacing: '-0.01em'
    }
  }, "Design or print a vehicle wrap."), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 14,
      color: '#52525B',
      textAlign: 'center',
      maxWidth: 480,
      lineHeight: 1.5
    }
  }, "Customers describe a wrap and get four photoreal mockups. Shops receive print-ready panels with full metadata."), /*#__PURE__*/React.createElement("nav", {
    style: {
      display: 'flex',
      gap: 12,
      marginTop: 8
    }
  }, /*#__PURE__*/React.createElement(AwsButton, {
    variant: "primary",
    onClick: () => onNavigate('/signup')
  }, "I'm a customer"), /*#__PURE__*/React.createElement(AwsButton, {
    variant: "outline",
    onClick: () => onNavigate('/signup-shop')
  }, "I run a wrap shop")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 16,
      marginTop: 16,
      fontSize: 13
    }
  }, /*#__PURE__*/React.createElement("a", {
    href: "#",
    onClick: e => {
      e.preventDefault();
      onNavigate('/vehicles/select');
    },
    style: {
      color: '#52525B',
      textDecoration: 'underline',
      textUnderlineOffset: 2
    }
  }, "Browse vehicles"), /*#__PURE__*/React.createElement("a", {
    href: "#",
    onClick: e => {
      e.preventDefault();
      onNavigate('/signin');
    },
    style: {
      color: '#52525B',
      textDecoration: 'underline',
      textUnderlineOffset: 2
    }
  }, "Sign in")));
}

// --- Signup with strength meter -------------------------------------------
function passwordStrength(p) {
  if (!p || p.length === 0) return 0;
  let s = 0;
  if (p.length >= 12) s++;
  if (/[A-Z]/.test(p) && /[a-z]/.test(p)) s++;
  if (/\d/.test(p)) s++;
  if (/[^A-Za-z0-9]/.test(p)) s++;
  return Math.min(s, 4);
}
function AuthPage({
  mode = 'signup',
  onNavigate
}) {
  const [password, setPassword] = usePagesState('');
  const strength = passwordStrength(password);
  const labels = ['Too weak', 'Weak', 'Okay', 'Strong', 'Excellent'];
  const colors = ['#EF4444', '#F97316', '#EAB308', '#84CC16', '#10B981'];
  return /*#__PURE__*/React.createElement("main", {
    style: {
      minHeight: '100%',
      background: '#FAFAFA',
      display: 'flex',
      justifyContent: 'center',
      padding: '48px 16px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: '100%',
      maxWidth: 480,
      display: 'flex',
      flexDirection: 'column',
      gap: 24
    }
  }, /*#__PURE__*/React.createElement("header", null, /*#__PURE__*/React.createElement(Eyebrow, null, "Alpha Wolf Wrap Studio"), /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: '8px 0 0',
      fontSize: 24,
      fontWeight: 600,
      color: '#18181B',
      letterSpacing: '-0.01em'
    }
  }, mode === 'signin' ? 'Sign in' : 'Create your account'), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '8px 0 0',
      fontSize: 14,
      color: '#52525B',
      lineHeight: 1.5
    }
  }, mode === 'signin' ? 'Welcome back — pick up where you left off.' : "We'll send a 6-digit OTP to verify your email.")), /*#__PURE__*/React.createElement("form", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 16
    },
    onSubmit: e => {
      e.preventDefault();
      onNavigate('/welcome');
    }
  }, mode === 'signup' && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 4
    }
  }, /*#__PURE__*/React.createElement(Label, {
    htmlFor: "signup-fn"
  }, "First name"), /*#__PURE__*/React.createElement(Input, {
    id: "signup-fn"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 4
    }
  }, /*#__PURE__*/React.createElement(Label, {
    htmlFor: "signup-ln"
  }, "Last name"), /*#__PURE__*/React.createElement(Input, {
    id: "signup-ln"
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 4
    }
  }, /*#__PURE__*/React.createElement(Label, {
    htmlFor: "signup-email"
  }, "Email"), /*#__PURE__*/React.createElement(Input, {
    id: "signup-email",
    type: "email"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 4
    }
  }, /*#__PURE__*/React.createElement(Label, {
    htmlFor: "signup-pw"
  }, "Password"), /*#__PURE__*/React.createElement(Input, {
    id: "signup-pw",
    type: "password",
    value: password,
    onChange: e => setPassword(e.target.value)
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 8
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      height: 6,
      width: '100%',
      borderRadius: 3,
      background: '#E4E4E7',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      height: '100%',
      transition: 'width 200ms',
      width: `${(strength + 1) * 20}%`,
      background: colors[strength]
    }
  })), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '6px 0 0',
      fontSize: 11,
      color: '#52525B'
    }
  }, password.length ? labels[strength] : '12+ chars, 1 letter, 1 number, 1 symbol'))), /*#__PURE__*/React.createElement(AwsButton, {
    variant: "primary"
  }, mode === 'signin' ? 'Sign in' : 'Create account')), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 13,
      color: '#52525B',
      textAlign: 'center'
    }
  }, mode === 'signin' ? /*#__PURE__*/React.createElement(React.Fragment, null, "New here? ", /*#__PURE__*/React.createElement("a", {
    href: "#",
    onClick: e => {
      e.preventDefault();
      onNavigate('/signup');
    },
    style: {
      color: '#18181B',
      fontWeight: 500
    }
  }, "Create an account \u2192")) : /*#__PURE__*/React.createElement(React.Fragment, null, "Already have one? ", /*#__PURE__*/React.createElement("a", {
    href: "#",
    onClick: e => {
      e.preventDefault();
      onNavigate('/signin');
    },
    style: {
      color: '#18181B',
      fontWeight: 500
    }
  }, "Sign in \u2192")))));
}

// --- Welcome ---------------------------------------------------------------
function WelcomePage({
  onNavigate
}) {
  return /*#__PURE__*/React.createElement("main", {
    style: {
      minHeight: '100%',
      background: '#FAFAFA',
      padding: '48px 16px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      margin: '0 auto',
      maxWidth: 672
    }
  }, /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: 0,
      fontSize: 24,
      fontWeight: 600,
      color: '#18181B'
    }
  }, "You're in."), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '8px 0 0',
      fontSize: 16,
      color: '#52525B'
    }
  }, "Pick the vehicle you want to wrap to get started."), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 32,
      borderRadius: 12,
      border: '1px solid #E4E4E7',
      background: '#FFFFFF',
      padding: 32,
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '0 0 16px',
      fontSize: 14,
      color: '#52525B'
    }
  }, "Your design starts on an accurate vehicle outline."), /*#__PURE__*/React.createElement(AwsButton, {
    variant: "primary",
    onClick: () => onNavigate('/vehicles/select')
  }, "Choose your vehicle"))));
}

// --- Vehicle select --------------------------------------------------------
function VehicleSelectPage({
  onSelect,
  onNavigate
}) {
  return /*#__PURE__*/React.createElement("main", {
    style: {
      minHeight: '100%',
      background: '#FAFAFA',
      padding: '48px 16px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      margin: '0 auto',
      maxWidth: 1024
    }
  }, /*#__PURE__*/React.createElement("header", {
    style: {
      marginBottom: 32
    }
  }, /*#__PURE__*/React.createElement(Eyebrow, null, "Alpha Wolf Wrap Studio"), /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: '6px 0 0',
      fontSize: 24,
      fontWeight: 600,
      color: '#18181B',
      letterSpacing: '-0.01em'
    }
  }, "Choose your vehicle"), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '8px 0 0',
      maxWidth: 640,
      fontSize: 14,
      color: '#52525B',
      lineHeight: 1.55
    }
  }, "Pick your exact year, make, model, and trim \u2014 or search \u2014 so your design starts on an accurate, wrap-safe outline.")), /*#__PURE__*/React.createElement(VehicleBrowser, {
    onSelect: onSelect
  })));
}

// --- Projects --------------------------------------------------------------
const SAMPLE_PROJECTS = [{
  id: 'prj-7f2a',
  name: 'Garage Cowboy fleet wrap',
  vehicle: '2024 Ford Transit 250',
  updated: 'May 25',
  bodyType: 'van'
}, {
  id: 'prj-9b3c',
  name: 'Casey HVAC primary van',
  vehicle: '2024 Ford Transit 250',
  updated: 'May 24',
  bodyType: 'van'
}, {
  id: 'prj-2e1d',
  name: 'Brewers Bench color change',
  vehicle: '2024 Jeep Wrangler',
  updated: 'May 18',
  bodyType: 'suv'
}];
function ProjectsPage({
  onOpen,
  onNavigate,
  hasProjects = true
}) {
  return /*#__PURE__*/React.createElement("main", {
    style: {
      minHeight: '100%',
      background: '#FAFAFA',
      padding: '48px 16px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      margin: '0 auto',
      maxWidth: 1024
    }
  }, /*#__PURE__*/React.createElement("header", {
    style: {
      marginBottom: 32,
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(Eyebrow, null, "Alpha Wolf Wrap Studio"), /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: '6px 0 0',
      fontSize: 24,
      fontWeight: 600,
      color: '#18181B',
      letterSpacing: '-0.01em'
    }
  }, "Your projects"), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '8px 0 0',
      maxWidth: 640,
      fontSize: 14,
      color: '#52525B',
      lineHeight: 1.55
    }
  }, "Pick up where you left off, or start a new wrap design from a vehicle template.")), /*#__PURE__*/React.createElement(AwsButton, {
    variant: "primary",
    onClick: () => onNavigate('/vehicles/select')
  }, "New project")), !hasProjects ? /*#__PURE__*/React.createElement(AwsCard, {
    dashed: true,
    style: {
      textAlign: 'center',
      padding: 32
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: 0,
      fontSize: 18,
      fontWeight: 600,
      color: '#18181B'
    }
  }, "No projects yet"), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 14,
      color: '#52525B'
    }
  }, "Choose a vehicle template and start your first wrap design."), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 12
    }
  }, /*#__PURE__*/React.createElement(AwsButton, {
    variant: "primary",
    onClick: () => onNavigate('/vehicles/select')
  }, "Start your first project")))) : /*#__PURE__*/React.createElement("ul", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gap: 16,
      padding: 0,
      listStyle: 'none',
      margin: 0
    }
  }, SAMPLE_PROJECTS.map(p => /*#__PURE__*/React.createElement("li", {
    key: p.id
  }, /*#__PURE__*/React.createElement(AwsCard, {
    hoverable: true,
    style: {
      display: 'flex',
      flexDirection: 'column',
      height: '100%'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '24px 24px 0'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: 0,
      fontSize: 15,
      fontWeight: 600,
      color: '#18181B',
      lineHeight: 1.3
    },
    title: p.name
  }, p.name), /*#__PURE__*/React.createElement("button", {
    style: {
      border: 0,
      background: 'transparent',
      cursor: 'pointer',
      padding: 4,
      color: '#71717A'
    },
    "aria-label": "More"
  }, /*#__PURE__*/React.createElement(IconMore, {
    size: 16
  }))), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '6px 0 0',
      fontSize: 13,
      color: '#71717A'
    }
  }, "Updated ", p.updated, " \xB7 ", p.vehicle)), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '12px 24px 24px',
      marginTop: 'auto'
    }
  }, /*#__PURE__*/React.createElement(AwsButton, {
    variant: "outline",
    size: "sm",
    onClick: () => onOpen?.(p)
  }, "Open"))))))));
}

// --- App shell header (for project + editor routes) -----------------------
function AppHeader({
  user = 'casey@example.com',
  onNavigate,
  currentPath
}) {
  return /*#__PURE__*/React.createElement("header", {
    style: {
      borderBottom: '1px solid #E4E4E7',
      background: '#FFFFFF'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      margin: '0 auto',
      maxWidth: 1280,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 16,
      padding: '10px 24px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 16
    }
  }, /*#__PURE__*/React.createElement("a", {
    href: "#",
    onClick: e => {
      e.preventDefault();
      onNavigate('/projects');
    },
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8,
      color: '#18181B',
      textDecoration: 'none'
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/logo.png",
    alt: "",
    style: {
      height: 22,
      width: 'auto',
      display: 'block'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      fontWeight: 600
    }
  }, "Wrap Studio")), /*#__PURE__*/React.createElement("nav", {
    style: {
      display: 'flex',
      gap: 4,
      fontSize: 13
    }
  }, [['/projects', 'Projects'], ['/vehicles/select', 'Vehicles'], ['/admin', 'Admin']].map(([h, l]) => /*#__PURE__*/React.createElement("a", {
    key: h,
    href: "#",
    onClick: e => {
      e.preventDefault();
      onNavigate(h);
    },
    style: {
      padding: '6px 10px',
      borderRadius: 6,
      color: currentPath === h ? '#18181B' : '#52525B',
      textDecoration: 'none',
      fontWeight: 500,
      background: currentPath === h ? '#F4F4F5' : 'transparent'
    }
  }, l)))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      fontSize: 13
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: '#71717A'
    }
  }, user), /*#__PURE__*/React.createElement("button", {
    style: {
      border: 0,
      background: 'transparent',
      color: '#52525B',
      cursor: 'pointer',
      textDecoration: 'underline',
      textUnderlineOffset: 2,
      padding: 0
    }
  }, "Sign out"))));
}
Object.assign(window, {
  HomePage,
  AuthPage,
  WelcomePage,
  VehicleSelectPage,
  ProjectsPage,
  AppHeader,
  SAMPLE_PROJECTS
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/wrap_studio/pages.jsx", error: String((e && e.message) || e) }); }

// ui_kits/wrap_studio/vehicle.jsx
try { (() => {
// Vehicle browser, vehicle card, and outline previews for the Wrap Studio app.
// Models the cascade behaviour from components/vehicles/VehicleBrowser.tsx.

const {
  useState,
  useMemo
} = React;

// --- Outline silhouettes (line-drawn 4-view stand-ins) --------------------
function PickupOutline() {
  return /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 320 80",
    width: "100%",
    height: "100%",
    preserveAspectRatio: "xMidYMid meet"
  }, /*#__PURE__*/React.createElement("g", {
    fill: "none",
    stroke: "#27272A",
    strokeWidth: "1.8",
    strokeLinejoin: "round",
    strokeLinecap: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M 20 58 L 20 42 Q 20 36 26 36 L 70 36 L 90 22 L 130 22 Q 138 22 142 30 L 150 38 L 280 38 Q 290 38 290 48 L 290 58"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "20",
    y1: "58",
    x2: "290",
    y2: "58"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "150",
    y1: "38",
    x2: "150",
    y2: "58"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "70",
    cy: "58",
    r: "9",
    fill: "#FFFFFF"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "240",
    cy: "58",
    r: "9",
    fill: "#FFFFFF"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "70",
    cy: "58",
    r: "3.5",
    fill: "#27272A"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "240",
    cy: "58",
    r: "3.5",
    fill: "#27272A"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "92",
    y: "26",
    width: "38",
    height: "14",
    rx: "2",
    fill: "none",
    stroke: "#A1A1AA",
    strokeWidth: "1.2"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "111",
    y1: "26",
    x2: "111",
    y2: "40",
    stroke: "#A1A1AA",
    strokeWidth: "1"
  })));
}
function VanOutline() {
  return /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 320 80",
    width: "100%",
    height: "100%",
    preserveAspectRatio: "xMidYMid meet"
  }, /*#__PURE__*/React.createElement("g", {
    fill: "none",
    stroke: "#27272A",
    strokeWidth: "1.8",
    strokeLinejoin: "round",
    strokeLinecap: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M 22 58 L 22 24 Q 22 18 28 18 L 250 18 Q 270 18 285 32 L 295 50 Q 297 58 290 58"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "22",
    y1: "58",
    x2: "290",
    y2: "58"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "62",
    cy: "58",
    r: "9",
    fill: "#FFFFFF"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "240",
    cy: "58",
    r: "9",
    fill: "#FFFFFF"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "62",
    cy: "58",
    r: "3.5",
    fill: "#27272A"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "240",
    cy: "58",
    r: "3.5",
    fill: "#27272A"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "28",
    y: "22",
    width: "40",
    height: "16",
    rx: "2",
    fill: "none",
    stroke: "#A1A1AA",
    strokeWidth: "1.2"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "100",
    y1: "18",
    x2: "100",
    y2: "58",
    stroke: "#A1A1AA",
    strokeWidth: "1.2"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "220",
    y: "22",
    width: "56",
    height: "24",
    rx: "2",
    fill: "none",
    stroke: "#A1A1AA",
    strokeWidth: "1.2"
  })));
}
function SuvOutline() {
  return /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 320 80",
    width: "100%",
    height: "100%",
    preserveAspectRatio: "xMidYMid meet"
  }, /*#__PURE__*/React.createElement("g", {
    fill: "none",
    stroke: "#27272A",
    strokeWidth: "1.8",
    strokeLinejoin: "round",
    strokeLinecap: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M 22 56 L 22 44 Q 22 38 30 38 L 60 30 Q 70 24 90 24 L 220 24 Q 240 24 252 32 L 280 38 Q 295 38 295 48 L 295 56"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "22",
    y1: "56",
    x2: "295",
    y2: "56"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M 72 30 L 130 26 L 200 26 L 235 32 L 240 38 L 72 38 Z",
    fill: "#000000",
    opacity: "0.85"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "130",
    y1: "26",
    x2: "130",
    y2: "38",
    stroke: "#A1A1AA",
    strokeWidth: "1"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "180",
    y1: "26",
    x2: "180",
    y2: "38",
    stroke: "#A1A1AA",
    strokeWidth: "1"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "78",
    cy: "56",
    r: "10",
    fill: "#FFFFFF"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "240",
    cy: "56",
    r: "10",
    fill: "#FFFFFF"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "78",
    cy: "56",
    r: "4",
    fill: "#27272A"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "240",
    cy: "56",
    r: "4",
    fill: "#27272A"
  })));
}
const OUTLINE_BY_TYPE = {
  pickup: PickupOutline,
  van: VanOutline,
  sprinter: VanOutline,
  suv: SuvOutline
};
function OutlinePreview({
  bodyType,
  className = ''
}) {
  const C = OUTLINE_BY_TYPE[bodyType] || PickupOutline;
  return /*#__PURE__*/React.createElement("div", {
    className: className,
    style: {
      width: '100%',
      background: '#F4F4F5',
      borderBottom: '1px solid #E4E4E7',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '14px 24px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: '70%',
      height: 60
    }
  }, /*#__PURE__*/React.createElement(C, null)));
}

// --- Sample vehicle data --------------------------------------------------
const SAMPLE_VEHICLES = [{
  id: 'ford-transit-250-148wb-hr',
  year: 2024,
  make: 'Ford',
  model: 'Transit 250',
  trim: '148″WB High Roof',
  bodyType: 'van',
  dims: '236.7″ L · 110.0″ H · 81.3″ W'
}, {
  id: 'ford-transit-350-el-hr',
  year: 2024,
  make: 'Ford',
  model: 'Transit 350',
  trim: 'EL High Roof',
  bodyType: 'van',
  dims: '263.9″ L · 110.0″ H · 81.3″ W'
}, {
  id: 'ford-f150-supercrew-65',
  year: 2024,
  make: 'Ford',
  model: 'F-150',
  trim: 'SuperCrew 6.5′',
  bodyType: 'pickup',
  dims: '243.7″ L · 77.2″ H · 79.9″ W'
}, {
  id: 'ford-f150-supercrew-55',
  year: 2024,
  make: 'Ford',
  model: 'F-150',
  trim: 'SuperCrew 5.5′',
  bodyType: 'pickup',
  dims: '231.7″ L · 77.2″ H · 79.9″ W'
}, {
  id: 'chev-silverado-1500-cc',
  year: 2024,
  make: 'Chevrolet',
  model: 'Silverado 1500',
  trim: 'Crew Cab',
  bodyType: 'pickup',
  dims: '241.2″ L · 75.5″ H · 81.2″ W'
}, {
  id: 'ram-promaster-2500-hr',
  year: 2024,
  make: 'Ram',
  model: 'ProMaster 2500',
  trim: 'High Roof',
  bodyType: 'sprinter',
  dims: '236.0″ L · 100.7″ H · 82.8″ W'
}, {
  id: 'mb-sprinter-2500-170',
  year: 2024,
  make: 'Mercedes-Benz',
  model: 'Sprinter 2500',
  trim: '170″WB High Roof',
  bodyType: 'sprinter',
  dims: '274.3″ L · 107.5″ H · 79.7″ W'
}, {
  id: 'toyota-tacoma-dc',
  year: 2024,
  make: 'Toyota',
  model: 'Tacoma',
  trim: 'Double Cab',
  bodyType: 'pickup',
  dims: '212.3″ L · 71.6″ H · 75.2″ W'
}, {
  id: 'jeep-wrangler-4door',
  year: 2024,
  make: 'Jeep',
  model: 'Wrangler',
  trim: '4-Door Sport',
  bodyType: 'suv',
  dims: '188.2″ L · 73.6″ H · 73.8″ W'
}];

// --- VehicleCard ----------------------------------------------------------
function VehicleCard({
  vehicle,
  onUse
}) {
  const [hover, setHover] = useState(false);
  const title = `${vehicle.year} ${vehicle.make} ${vehicle.model}${vehicle.trim ? ' · ' + vehicle.trim : ''}`;
  return /*#__PURE__*/React.createElement("article", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      borderRadius: 12,
      border: '1px solid #E4E4E7',
      background: '#FFFFFF',
      boxShadow: hover ? '0 4px 6px -1px rgba(0,0,0,.1), 0 2px 4px -2px rgba(0,0,0,.05)' : '0 1px 3px rgba(0,0,0,.08)',
      transition: 'box-shadow 200ms'
    },
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false)
  }, /*#__PURE__*/React.createElement(OutlinePreview, {
    bodyType: vehicle.bodyType
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      padding: 16,
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: 0,
      fontSize: 14,
      fontWeight: 600,
      color: '#18181B'
    }
  }, title), /*#__PURE__*/React.createElement("span", {
    style: {
      flexShrink: 0,
      borderRadius: 9999,
      background: '#F4F4F5',
      padding: '2px 8px',
      fontSize: 11,
      color: '#52525B',
      textTransform: 'capitalize'
    }
  }, vehicle.bodyType)), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 12,
      color: '#71717A',
      fontFamily: 'var(--font-mono)'
    }
  }, vehicle.dims), /*#__PURE__*/React.createElement(AwsButton, {
    variant: "primary",
    size: "default",
    onClick: () => onUse?.(vehicle),
    style: {
      marginTop: 'auto'
    }
  }, "Use this template")));
}

// --- VehicleBrowser -------------------------------------------------------
function VehicleBrowser({
  onSelect
}) {
  const [sel, setSel] = useState({
    year: '',
    make: '',
    model: '',
    trim: '',
    cabSize: '',
    roofHeight: ''
  });
  const [query, setQuery] = useState('');
  const years = [2024, 2023, 2022, 2021, 2020];
  const makes = useMemo(() => Array.from(new Set(SAMPLE_VEHICLES.filter(v => !sel.year || v.year === Number(sel.year)).map(v => v.make))), [sel.year]);
  const models = useMemo(() => Array.from(new Set(SAMPLE_VEHICLES.filter(v => (!sel.year || v.year === Number(sel.year)) && (!sel.make || v.make === sel.make)).map(v => v.model))), [sel.year, sel.make]);
  const trims = useMemo(() => SAMPLE_VEHICLES.filter(v => (!sel.year || v.year === Number(sel.year)) && (!sel.make || v.make === sel.make) && (!sel.model || v.model === sel.model)).map(v => v.trim), [sel.year, sel.make, sel.model]);
  const results = useMemo(() => {
    if (query.trim().length >= 2) {
      const q = query.toLowerCase();
      return SAMPLE_VEHICLES.filter(v => `${v.year} ${v.make} ${v.model} ${v.trim}`.toLowerCase().includes(q));
    }
    return SAMPLE_VEHICLES.filter(v => {
      if (sel.year && v.year !== Number(sel.year)) return false;
      if (sel.make && v.make !== sel.make) return false;
      if (sel.model && v.model !== sel.model) return false;
      if (sel.trim && v.trim !== sel.trim) return false;
      return true;
    });
  }, [sel, query]);
  const showRoof = results.some(v => v.bodyType === 'van' || v.bodyType === 'sprinter');
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 32
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 4
    }
  }, /*#__PURE__*/React.createElement(Label, {
    htmlFor: "vb-search"
  }, "Search"), /*#__PURE__*/React.createElement(Input, {
    id: "vb-search",
    type: "search",
    value: query,
    onChange: e => setQuery(e.target.value),
    placeholder: "e.g. 2024 transit 250 high roof"
  }), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '2px 0 0',
      fontSize: 11,
      color: '#71717A'
    }
  }, "Typo-tolerant \u2014 \"transt 250\" finds Transit 250.")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(4, 1fr)',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 4
    }
  }, /*#__PURE__*/React.createElement(Label, {
    htmlFor: "vb-year"
  }, "Year"), /*#__PURE__*/React.createElement(Select, {
    id: "vb-year",
    value: sel.year,
    onChange: v => setSel({
      year: v,
      make: '',
      model: '',
      trim: '',
      cabSize: '',
      roofHeight: ''
    }),
    options: years.map(y => ({
      value: y,
      label: y
    })),
    placeholder: "Select year"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 4
    }
  }, /*#__PURE__*/React.createElement(Label, {
    htmlFor: "vb-make"
  }, "Make"), /*#__PURE__*/React.createElement(Select, {
    id: "vb-make",
    disabled: !sel.year,
    value: sel.make,
    onChange: v => setSel(s => ({
      ...s,
      make: v,
      model: '',
      trim: ''
    })),
    options: makes.map(m => ({
      value: m,
      label: m
    })),
    placeholder: "Select make"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 4
    }
  }, /*#__PURE__*/React.createElement(Label, {
    htmlFor: "vb-model"
  }, "Model"), /*#__PURE__*/React.createElement(Select, {
    id: "vb-model",
    disabled: !sel.make,
    value: sel.model,
    onChange: v => setSel(s => ({
      ...s,
      model: v,
      trim: ''
    })),
    options: models.map(m => ({
      value: m,
      label: m
    })),
    placeholder: "Select model"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 4
    }
  }, /*#__PURE__*/React.createElement(Label, {
    htmlFor: "vb-trim"
  }, "Trim"), /*#__PURE__*/React.createElement(Select, {
    id: "vb-trim",
    disabled: !sel.model,
    value: sel.trim,
    onChange: v => setSel(s => ({
      ...s,
      trim: v
    })),
    options: trims.map(t => ({
      value: t,
      label: t
    })),
    placeholder: "Any trim"
  }))), sel.model && showRoof && /*#__PURE__*/React.createElement("fieldset", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      borderRadius: 8,
      border: '1px solid #E4E4E7',
      background: '#FAFAFA',
      padding: 16,
      margin: 0
    }
  }, /*#__PURE__*/React.createElement("legend", {
    style: {
      padding: '0 4px',
      fontSize: 11,
      fontWeight: 500,
      textTransform: 'uppercase',
      letterSpacing: '0.10em',
      color: '#71717A'
    }
  }, "Configuration"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 4
    }
  }, /*#__PURE__*/React.createElement(Label, {
    htmlFor: "vb-roof"
  }, "Roof height"), /*#__PURE__*/React.createElement(Select, {
    id: "vb-roof",
    value: sel.roofHeight,
    onChange: v => setSel(s => ({
      ...s,
      roofHeight: v
    })),
    options: [{
      value: 'low',
      label: 'Low'
    }, {
      value: 'mid',
      label: 'Mid'
    }, {
      value: 'high',
      label: 'High'
    }],
    placeholder: "Any roof"
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 16
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 13,
      color: '#52525B'
    },
    "aria-live": "polite"
  }, query.trim().length >= 2 ? `${results.length} match${results.length === 1 ? '' : 'es'} for "${query}"` : results.length > 0 ? `${results.length} template${results.length === 1 ? '' : 's'}` : 'Pick a vehicle above or search to begin.'), results.length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gap: 16
    }
  }, results.map(v => /*#__PURE__*/React.createElement(VehicleCard, {
    key: v.id,
    vehicle: v,
    onUse: onSelect
  })))), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      textAlign: 'center',
      fontSize: 13,
      color: '#71717A'
    }
  }, /*#__PURE__*/React.createElement("a", {
    href: "#",
    onClick: e => e.preventDefault(),
    style: {
      fontWeight: 500,
      color: '#18181B',
      textDecoration: 'none'
    }
  }, "Don't see your vehicle? Request it \u2192")));
}
Object.assign(window, {
  OutlinePreview,
  VehicleCard,
  VehicleBrowser,
  SAMPLE_VEHICLES
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/wrap_studio/vehicle.jsx", error: String((e && e.message) || e) }); }

// uploads/fonts.ts
try { (() => {
// Centralized font module, single source of truth for Alpha Wolf Decals
// typography. The PRD's first-choice typeface is unlicensed for third-party
// commercial use; the locked fallback is Geist (Vercel, SIL OFL 1.1) at exact
// pin geist@1.7.0. See docs/font-decision.md for the full rationale, license
// audit, and propagation checklist.
//
// Self-hosted via next/font/local pointing at the .woff2 files inside the
// geist npm package, no mirroring into public/fonts/ (which docs/font-
// decision.md Section 5 + Section 8 item 5 forbid). We define our own
// next/font/local config rather than re-exporting `geist/font/sans` so we
// can set `display: 'optional'`: under simulated 4G mobile, font-display:
// swap was causing a visible swap from system-ui → Geist around the 6-9 s
// mark, which Lighthouse counted as "visual change" and dragged Speed Index.
// `optional` uses the fallback for the entire session if the font isn't
// ready in ~100 ms, giving zero visual swap and a clean SI curve. The
// fallback chain (system-ui → -apple-system → sans-serif) reads cleanly.

const sansFont = localFont({
  src: '../node_modules/geist/dist/fonts/geist-sans/Geist-Variable.woff2',
  variable: '--font-geist-sans',
  weight: '100 900',
  display: 'optional'
});
const monoFont = localFont({
  src: '../node_modules/geist/dist/fonts/geist-mono/GeistMono-Variable.woff2',
  variable: '--font-geist-mono',
  weight: '100 900',
  display: 'optional'
});
const fontVariables = `${sansFont.variable} ${monoFont.variable}`;
Object.assign(__ds_scope, { sansFont, monoFont, fontVariables });
})(); } catch (e) { __ds_ns.__errors.push({ path: "uploads/fonts.ts", error: String((e && e.message) || e) }); }

})();
