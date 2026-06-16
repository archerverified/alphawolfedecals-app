// Marketing-page sections — Hero, ServicesGrid, WhyTrustBand,
// Testimonials, FinancingStrip, FinalCta. Re-creations of
// components/sections/*.tsx from the AlphaWolfDecals codebase, with
// the same composition and motion choices.

const { useEffect, useRef, useState } = React;

// --- Hero ------------------------------------------------------------------
function Hero({ onNavigate }) {
  return (
    <section style={{ position: 'relative', display: 'flex', flexDirection: 'column', background: '#000000', color: '#FFFFFF' }}>
      {/* Cinema band — autoplaying hero video (the real site asset). */}
      <div style={{ position: 'relative', width: '100%', overflow: 'hidden' }}>
        <div style={{ position: 'relative', width: '100%', aspectRatio: '21/9', maxHeight: '60vh', background: '#000000' }}>
          <video
            src="../../assets/hero.mp4"
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            aria-hidden="true"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
          />
          {/* bottom-edge fade */}
          <div aria-hidden style={{ position: 'absolute', inset: 'auto 0 0 0', height: 96, background: 'linear-gradient(to bottom, transparent, #000000)', pointerEvents: 'none' }} />
        </div>
      </div>

      {/* Copy band */}
      <div style={{ position: 'relative', margin: '0 auto', display: 'flex', width: '100%', maxWidth: 1280, flexDirection: 'column', padding: '64px 24px 96px' }}>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.30em', color: '#00AEEF', margin: 0 }}>
          Salem, Oregon
        </p>
        <h1 style={{ margin: '20px 0 0', maxWidth: 960, fontSize: 'clamp(56px, 7.5vw, 96px)', lineHeight: 0.95, letterSpacing: '-0.02em', color: '#FFFFFF', fontWeight: 400 }}>
          <span style={{ display: 'block', fontWeight: 300 }}>Don&rsquo;t Blend In.</span>
          <span style={{ display: 'inline-block', position: 'relative', marginTop: 8, fontWeight: 700 }}>
            Lead the Pack.
            <span style={{ position: 'absolute', left: 0, bottom: -8, height: 3, width: '100%', background: '#00AEEF', transformOrigin: 'left center', animation: 'awd-underline-draw 400ms cubic-bezier(0.32, 0.72, 0, 1) 400ms forwards', transform: 'scaleX(0)' }} />
          </span>
        </h1>
        <p style={{ margin: '32px 0 0', maxWidth: 600, fontSize: 18, lineHeight: 1.55, color: '#9CA3AF' }}>
          Vinyl wraps, ceramic tint, paint protection film, and storefront signage from a single shop floor in Salem, Oregon.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 40 }}>
          <Button variant="primary" size="lg" href="/quote" onClick={(e) => { e.preventDefault(); onNavigate?.('/quote'); }}>Get a Quote</Button>
          <Button variant="outline" size="lg" href="/book" onClick={(e) => { e.preventDefault(); onNavigate?.('/book'); }}>Book Now</Button>
        </div>
        {/* Paw + scroll cue */}
        <a href="#after-hero" onClick={(e)=>e.preventDefault()} style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8, marginTop: 48, color: '#8B92A0', textDecoration: 'none' }}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <ellipse cx="6.5" cy="9" rx="1.6" ry="2.2" />
            <ellipse cx="10.5" cy="6" rx="1.6" ry="2.2" />
            <ellipse cx="13.5" cy="6" rx="1.6" ry="2.2" />
            <ellipse cx="17.5" cy="9" rx="1.6" ry="2.2" />
            <path d="M12 11.5c-2.8 0-5.2 2.2-5.2 4.6 0 1.6 1.4 2.4 2.6 2.4.9 0 1.6-.4 2.6-.4s1.7.4 2.6.4c1.2 0 2.6-.8 2.6-2.4 0-2.4-2.4-4.6-5.2-4.6Z" />
          </svg>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.30em' }}>Scroll</span>
        </a>
      </div>
    </section>
  );
}

// --- ServicesGrid ----------------------------------------------------------
const SERVICES = [
  { slug: 'vinyl-wraps', eyebrow: 'Personal', label: 'Vinyl Wraps', description: 'Personal-vehicle wraps in any finish.', href: '/services/vinyl-wraps' },
  { slug: 'commercial-wraps', eyebrow: 'Fleet', label: 'Commercial Wraps', description: 'Fleet, vans, trailers, and work-truck graphics that survive the install bay and the freeway.', href: '/services/commercial-wraps' },
  { slug: 'vehicle-tint', eyebrow: 'Tint', label: 'Vehicle Tint', description: 'Ceramic and dyed window tint, installed to the legal limit.', href: '/services/vehicle-tint' },
  { slug: 'paint-protection-film', eyebrow: 'PPF', label: 'Paint Protection Film', description: 'XPEL and STEK PPF with self-healing topcoat — for new builds and the road-trip rig.', href: '/services/paint-protection-film' },
  { slug: 'color-change-wraps', eyebrow: 'Color change', label: 'Color-Change Wraps', description: 'Reversible color over factory paint — no resale hit, no commit.', href: '/services/color-change-wraps' },
  { slug: 'storefronts-signage', eyebrow: 'Signage', label: 'Storefronts & Signage', description: 'Storefront windows, building wraps, banners — designed and installed.', href: '/services/storefronts-signage' },
];

function ServicesGrid({ onNavigate }) {
  return (
    <section id="after-hero" aria-label="Our services" style={{ position: 'relative', background: '#0A0A0A', padding: '80px 0 112px' }}>
      <div style={{ margin: '0 auto', maxWidth: 1280, padding: '0 24px' }}>
        <SectionHeading
          eyebrow="What we do"
          title="Six disciplines, one shop floor."
          lede="Personal wraps, fleet graphics, ceramic tint, paint protection film, color-change wraps, and storefront signage. Designed, printed, and installed under one roof in Salem."
        />
        <ul style={{ marginTop: 48, padding: 0, listStyle: 'none', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {SERVICES.map((s) => (
            <li key={s.slug}>
              <ServiceCard service={s} onNavigate={onNavigate} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function ServiceCard({ service, onNavigate }) {
  const [hover, setHover] = useState(false);
  return (
    <a
      href={service.href}
      onClick={(e) => { e.preventDefault(); onNavigate?.(service.href); }}
      style={{
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
        transition: 'transform 300ms cubic-bezier(0.32, 0.72, 0, 1), border-color 300ms, box-shadow 300ms',
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div style={{ position: 'relative', overflow: 'hidden' }}>
        <div style={{ transition: 'transform 500ms cubic-bezier(0.32, 0.72, 0, 1)', transform: hover ? 'scale(1.04)' : 'none' }}>
          <ServiceArt slug={service.slug} />
        </div>
        <div aria-hidden style={{ position: 'absolute', inset: 'auto 0 0 0', height: 48, background: 'linear-gradient(to bottom, transparent, #000000)', pointerEvents: 'none' }} />
      </div>
      <div style={{ display: 'flex', flex: 1, flexDirection: 'column', gap: 8, padding: 24 }}>
        <p style={{ margin: 0, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.22em', color: '#00AEEF' }}>{service.eyebrow}</p>
        <h3 style={{ margin: 0, fontSize: 26, fontWeight: 600, lineHeight: 1.15, letterSpacing: '-0.01em', color: '#FFFFFF' }}>{service.label}</h3>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: '#9CA3AF' }}>{service.description}</p>
        <p style={{ margin: '12px 0 0', display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600, color: '#00AEEF' }}>
          <span>Explore</span>
          <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" style={{ transition: 'transform 300ms', transform: hover ? 'translateX(4px)' : 'none' }}>
            <path d="M3 8h10M9 4l4 4-4 4" />
          </svg>
        </p>
      </div>
    </a>
  );
}

// --- WhyTrustBand ----------------------------------------------------------
const STATS = [
  { value: 8, suffix: '+', label: 'Years on the shop floor' },
  { value: 1200, suffix: '+', label: 'Vehicles wrapped, tinted, or filmed' },
  { value: 5, suffix: '★', label: 'Average Google review rating' },
  { value: 250, suffix: 'k', label: 'Square feet of vinyl installed' },
];

function easeOutQuart(t) { return 1 - Math.pow(1 - t, 4); }

function Stat({ value, suffix, label }) {
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
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <p style={{ margin: 0, fontFamily: 'var(--font-mono)', fontSize: 'clamp(48px, 6vw, 72px)', fontWeight: 700, lineHeight: 0.95, letterSpacing: '-0.02em', color: '#FFFFFF' }}>
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>{current.toLocaleString('en-US')}</span>
        <span style={{ color: '#00AEEF' }}>{suffix}</span>
      </p>
      <p style={{ margin: 0, fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.18em', color: '#8B92A0' }}>{label}</p>
    </div>
  );
}

function WhyTrustBand() {
  return (
    <section aria-label="Why Alpha Wolf" style={{ position: 'relative', background: '#000000', padding: '80px 0 112px' }}>
      <div style={{ margin: '0 auto', maxWidth: 1280, padding: '0 24px' }}>
        <SectionHeading
          eyebrow="Why Alpha Wolf"
          title="A shop floor that earns its hours."
          lede="Numbers that come from a real install bay, not stock-photo claims. Confirmed against the shop's own records."
        />
        <dl style={{ marginTop: 64, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 40, padding: 0 }}>
          {STATS.map((s) => (
            <div key={s.label}>
              <dt style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)' }}>{s.label}</dt>
              <dd style={{ margin: 0 }}><Stat {...s} /></dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

// --- Testimonials ----------------------------------------------------------
const TESTIMONIALS = [
  { author: 'Marco R.', source: 'Google · Mar 2024', rating: 5, body: 'Brought in our 8-van fleet over two weeks. Every install came back identical — same logo placement, same edges. Zero re-do.' },
  { author: 'Cassidy L.', source: 'Google · Jan 2024', rating: 5, body: 'Color change from arctic-white to satin charcoal. Two and a half days. Pulled off perfectly, came home with a different car.' },
  { author: 'Mike & Jenna H.', source: 'Google · Nov 2023', rating: 5, body: 'Storefront vinyl + full window graphics for our new Salem location. They quoted, designed, and installed without us chasing.' },
];

function StarIcon({ filled }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill={filled ? '#00AEEF' : '#2A2A2A'}>
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  );
}

function Testimonials() {
  return (
    <section aria-label="Customer testimonials" style={{ position: 'relative', background: '#0A0A0A', padding: '80px 0 112px' }}>
      <div style={{ margin: '0 auto', maxWidth: 1280, padding: '0 24px' }}>
        <SectionHeading
          eyebrow="What customers say"
          title="Real reviews from real installs."
          lede="Verified Google reviews from Salem-area customers: wraps, tint, PPF, and signage."
        />
        <ul style={{ marginTop: 48, padding: 0, listStyle: 'none', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {TESTIMONIALS.map((t) => (
            <li key={t.author}>
              <article style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%', borderRadius: 8, border: '1px solid #1A1A1A', background: '#000000', padding: 24 }}>
                <div role="img" aria-label={`${t.rating} out of 5 stars`} style={{ display: 'inline-flex', gap: 4 }}>
                  {Array.from({ length: 5 }).map((_, i) => <StarIcon key={i} filled={i < t.rating} />)}
                </div>
                <blockquote style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: '#FFFFFF' }}>"{t.body}"</blockquote>
                <footer style={{ marginTop: 'auto', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, borderTop: '1px solid #1A1A1A', paddingTop: 16, fontSize: 11 }}>
                  <p style={{ margin: 0, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.18em', color: '#FFFFFF' }}>{t.author}</p>
                  <p style={{ margin: 0, fontFamily: 'var(--font-mono)', color: '#8B92A0' }}>{t.source}</p>
                </footer>
              </article>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

// --- FinancingStrip --------------------------------------------------------
function FinancingStrip({ onNavigate }) {
  return (
    <section style={{ background: '#000000', padding: '64px 0' }}>
      <div style={{ margin: '0 auto', maxWidth: 1280, padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 32, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 720 }}>
          <p style={{ margin: 0, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.22em', color: '#00AEEF' }}>0% financing available</p>
          <h3 style={{ margin: 0, fontSize: 28, fontWeight: 700, color: '#FFFFFF', lineHeight: 1.1, letterSpacing: '-0.01em' }}>Wrap now, pay over 12 — no interest.</h3>
          <p style={{ margin: 0, fontSize: 14, color: '#9CA3AF', maxWidth: 560 }}>Soft pull at checkout, decisions in under a minute. Available on jobs $500 and up.</p>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <Button variant="primary" size="default" href="/financing" onClick={(e)=>{e.preventDefault();onNavigate?.('/financing');}}>Apply Now</Button>
          <Button variant="ghost" size="default" href="/financing" onClick={(e)=>{e.preventDefault();onNavigate?.('/financing');}}>Learn More</Button>
        </div>
      </div>
    </section>
  );
}

// --- FinalCta --------------------------------------------------------------
function FinalCta({ onNavigate }) {
  return (
    <section aria-label="Ready to lead the pack" style={{ position: 'relative', overflow: 'hidden', background: '#000000', isolation: 'isolate' }}>
      <div aria-hidden style={{ position: 'absolute', inset: 0, zIndex: -1, background: 'radial-gradient(60% 60% at 50% 40%, rgba(0,174,239,0.18) 0%, rgba(10,10,10,0) 70%)' }} />
      <div style={{ margin: '0 auto', display: 'flex', maxWidth: 1024, flexDirection: 'column', alignItems: 'center', gap: 32, padding: '96px 24px 128px', textAlign: 'center' }}>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.30em', color: '#00AEEF' }}>Salem, Oregon</p>
        <h2 style={{ margin: 0, fontFamily: 'var(--font-sans)', fontSize: 'clamp(44px, 6vw, 80px)', fontWeight: 700, lineHeight: 0.95, letterSpacing: '-0.02em', color: '#FFFFFF' }}>
          Ready to <span style={{ color: '#00AEEF' }}>Lead the Pack?</span>
        </h2>
        <p style={{ margin: 0, maxWidth: 560, fontSize: 18, lineHeight: 1.55, color: '#9CA3AF' }}>
          Free quotes, transparent pricing, and a single shop floor that sees the project from quote to install. Reach out — we'll take it from there.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center', marginTop: 8 }}>
          <Button variant="primary" size="lg" href="/quote" onClick={(e)=>{e.preventDefault();onNavigate?.('/quote');}}>Get a Quote</Button>
          <Button variant="outline" size="lg" href="/book" onClick={(e)=>{e.preventDefault();onNavigate?.('/book');}}>Book Now</Button>
        </div>
      </div>
    </section>
  );
}

Object.assign(window, { Hero, ServicesGrid, ServiceCard, WhyTrustBand, Testimonials, FinancingStrip, FinalCta, SERVICES, TESTIMONIALS });
