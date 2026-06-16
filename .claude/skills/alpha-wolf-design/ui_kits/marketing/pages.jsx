// Composed marketing pages. Real Next.js routes:
//   /                              -> HomePage
//   /about                         -> AboutPage
//   /services/[slug]               -> ServiceDetailPage
//   /quote, /book, /contact, etc.  -> stub pages

function HomePage({ onNavigate }) {
  return (
    <>
      <Hero onNavigate={onNavigate} />
      <ServicesGrid onNavigate={onNavigate} />
      <WhyTrustBand />
      <Testimonials />
      <FinancingStrip onNavigate={onNavigate} />
      <FinalCta onNavigate={onNavigate} />
    </>
  );
}

// --- About -----------------------------------------------------------------
const TIMELINE = [
  { year: '2017', title: 'Bay opens in Salem', body: 'Started in a single-bay shop on Kashmir Way SE. Three services on day one: vinyl wraps, vehicle tint, and a sign-and-go gift-card box on the counter.' },
  { year: '2019', title: 'PPF certification + second bay', body: 'XPEL certified-installer training. Added a second install bay so back-to-back wraps stopped colliding with PPF jobs.' },
  { year: '2022', title: 'Storefronts + commercial fleet', body: 'First multi-vehicle fleet wrap (8 cargo vans). Storefronts and dimensional letters added to the menu.' },
  { year: '2024', title: 'Color-change wraps + ceramic upgrade', body: 'Ceramic tint replaces dyed as the default tint film. Color-change category formalized with a curated brand palette.' },
];

const TRUST_STATS = [
  { value: '8+', label: 'Years on Kashmir Way' },
  { value: '1,200+', label: 'Vehicles wrapped' },
  { value: '5★', label: 'Google rating' },
  { value: '250k', label: 'Sq ft of vinyl installed' },
];

function AboutPage({ onNavigate }) {
  return (
    <>
      <section style={{ margin: '0 auto', maxWidth: 896, padding: '96px 24px' }}>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.22em', color: '#00AEEF' }}>About</p>
        <h1 style={{ margin: '12px 0 0', fontSize: 'clamp(36px, 5vw, 60px)', fontWeight: 700, lineHeight: 1.1, letterSpacing: '-0.02em', color: '#FFFFFF' }}>
          Independent shop. Real installers. Salem-built.
        </h1>
        <p style={{ margin: '24px 0 0', maxWidth: 640, fontSize: 18, lineHeight: 1.6, color: '#9CA3AF' }}>
          Alpha Wolf Decals is a single-shop crew on Kashmir Way SE in Salem, Oregon. We wrap personal vehicles, tint daily drivers, install paint protection film on new builds, and brand commercial fleets and storefronts across the Mid-Willamette Valley.
        </p>
      </section>

      <section aria-label="Trust signals" style={{ borderTop: '1px solid #1A1A1A', borderBottom: '1px solid #1A1A1A', background: '#000000', padding: '64px 0' }}>
        <dl style={{ margin: '0 auto', maxWidth: 1280, padding: '0 24px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 40 }}>
          {TRUST_STATS.map((s) => (
            <div key={s.label}>
              <dd style={{ margin: 0 }}>
                <p style={{ margin: 0, fontFamily: 'var(--font-mono)', fontSize: 36, fontWeight: 700, letterSpacing: '-0.02em', color: '#FFFFFF', lineHeight: 1 }}>{s.value}</p>
                <p style={{ margin: '8px 0 0', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.18em', color: '#8B92A0' }}>{s.label}</p>
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-label="Shop timeline" style={{ margin: '0 auto', maxWidth: 896, padding: '96px 24px' }}>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.22em', color: '#00AEEF' }}>Shop story</p>
        <h2 style={{ margin: '12px 0 0', fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 700, lineHeight: 1.1, letterSpacing: '-0.02em', color: '#FFFFFF' }}>
          From a single-bay shop to a full-service install floor.
        </h2>
        <ol style={{ margin: '48px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 32 }}>
          {TIMELINE.map((e) => (
            <li key={e.year} style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 16 }}>
              <p style={{ margin: 0, fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', color: '#00AEEF' }}>{e.year}</p>
              <div>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#FFFFFF', lineHeight: 1.2 }}>{e.title}</h3>
                <p style={{ margin: '8px 0 0', fontSize: 15, lineHeight: 1.6, color: '#9CA3AF' }}>{e.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section style={{ margin: '0 auto', maxWidth: 896, padding: '0 24px 96px', display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        <Button variant="primary" size="lg" href="/quote" onClick={(e)=>{e.preventDefault();onNavigate?.('/quote');}}>Get a quote</Button>
        <Button variant="outline" size="lg" href="/gallery" onClick={(e)=>{e.preventDefault();onNavigate?.('/gallery');}}>See recent shop work</Button>
        <Button variant="ghost" size="lg" href="/contact" onClick={(e)=>{e.preventDefault();onNavigate?.('/contact');}}>Visit the shop</Button>
      </section>
    </>
  );
}

// --- Service detail (one minimal layout) ----------------------------------
function ServiceDetailPage({ slug, onNavigate }) {
  const svc = SERVICES.find((s) => s.slug === slug) || SERVICES[0];
  return (
    <>
      <section style={{ position: 'relative', borderBottom: '1px solid #1A1A1A', background: '#000000', overflow: 'hidden' }}>
        <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'radial-gradient(50% 60% at 75% 50%, rgba(0,174,239,0.18) 0%, rgba(0,0,0,0) 70%)' }} />
        <div style={{ position: 'relative', margin: '0 auto', maxWidth: 1280, padding: '64px 24px 96px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48, alignItems: 'center' }}>
          <div>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.22em', color: '#00AEEF' }}>{svc.eyebrow}</p>
            <h1 style={{ margin: '16px 0 0', fontSize: 'clamp(40px, 6vw, 72px)', fontWeight: 700, lineHeight: 1, letterSpacing: '-0.02em', color: '#FFFFFF' }}>{svc.label}</h1>
            <p style={{ margin: '24px 0 0', fontSize: 18, color: '#9CA3AF', lineHeight: 1.55, maxWidth: 480 }}>{svc.description}</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 32 }}>
              <Button variant="primary" size="lg" href="/quote" onClick={(e)=>{e.preventDefault();onNavigate?.('/quote');}}>Quote this job</Button>
              <Button variant="outline" size="lg" href="/gallery" onClick={(e)=>{e.preventDefault();onNavigate?.('/gallery');}}>See examples</Button>
            </div>
          </div>
          <div style={{ borderRadius: 8, border: '1px solid #1A1A1A', overflow: 'hidden' }}>
            <ServiceArt slug={svc.slug} />
          </div>
        </div>
      </section>

      <section style={{ background: '#0A0A0A', padding: '80px 0' }}>
        <div style={{ margin: '0 auto', maxWidth: 1280, padding: '0 24px' }}>
          <SectionHeading
            eyebrow="How it goes"
            title="A four-step process — no hand-offs."
            lede="Quote, design, install, ship-out. Same hands on every step."
          />
          <ol style={{ margin: '48px 0 0', padding: 0, listStyle: 'none', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
            {[
              { n: '01', t: 'Quote', d: 'Send photos and the vehicle. We quote within one business day.' },
              { n: '02', t: 'Design', d: 'AI-assisted mockups + revision rounds until you sign off.' },
              { n: '03', t: 'Install', d: 'Job book locked in writing. Vehicle drops off, work happens in-bay.' },
              { n: '04', t: 'Hand-off', d: 'Walk-around, care guide, and a photo for the wall.' },
            ].map((s) => (
              <li key={s.n} style={{ borderRadius: 8, border: '1px solid #1A1A1A', background: '#000000', padding: 24 }}>
                <p style={{ margin: 0, fontFamily: 'var(--font-mono)', fontSize: 13, color: '#00AEEF', letterSpacing: '0.18em' }}>{s.n}</p>
                <h3 style={{ margin: '12px 0 0', fontSize: 18, fontWeight: 600, color: '#FFFFFF' }}>{s.t}</h3>
                <p style={{ margin: '8px 0 0', fontSize: 13, color: '#9CA3AF', lineHeight: 1.55 }}>{s.d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </>
  );
}

// --- Stub page for /quote /book /contact /gallery /faq /financing --------
function StubPage({ path }) {
  const titles = {
    '/quote': 'Get a Quote', '/book': 'Book Now', '/contact': 'Visit the shop',
    '/gallery': 'Recent shop work', '/faq': 'Questions, answered', '/financing': '0% financing',
  };
  const title = titles[path] || path;
  return (
    <section style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ maxWidth: 560, padding: '64px 24px', textAlign: 'center' }}>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.22em', color: '#00AEEF' }}>UI Kit · stub</p>
        <h1 style={{ margin: '12px 0 0', fontSize: 40, fontWeight: 700, letterSpacing: '-0.02em', color: '#FFFFFF' }}>{title}</h1>
        <p style={{ margin: '16px 0 0', fontSize: 16, color: '#9CA3AF', lineHeight: 1.55 }}>This route exists in the production codebase. The UI kit ships the homepage / about / service-detail layouts as live examples; everything else is a routing stub for click-through purposes.</p>
      </div>
    </section>
  );
}

Object.assign(window, { HomePage, AboutPage, ServiceDetailPage, StubPage });
