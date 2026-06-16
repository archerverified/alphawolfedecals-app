// Composed Wrap Studio pages. Recreated layouts:
//   /                          -> HomePage  (the "I'm a customer" entry)
//   /signup, /signin           -> AuthPage  (with the 5-step strength meter)
//   /welcome                   -> WelcomePage
//   /vehicles/select           -> VehicleSelectPage
//   /projects                  -> ProjectsPage
//   /projects/[id]/editor      -> EditorPage

const { useState: usePagesState } = React;

// --- Home (logged-out home page) ------------------------------------------
function HomePage({ onNavigate }) {
  return (
    <main style={{ display: 'flex', minHeight: '100%', flex: 1, flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24, padding: 32, background: '#FAFAFA' }}>
      <Eyebrow>Alpha Wolf Wrap Studio</Eyebrow>
      <h1 style={{ margin: 0, fontSize: 30, fontWeight: 600, color: '#18181B', letterSpacing: '-0.01em' }}>Design or print a vehicle wrap.</h1>
      <p style={{ margin: 0, fontSize: 14, color: '#52525B', textAlign: 'center', maxWidth: 480, lineHeight: 1.5 }}>
        Customers describe a wrap and get four photoreal mockups. Shops receive print-ready panels with full metadata.
      </p>
      <nav style={{ display: 'flex', gap: 12, marginTop: 8 }}>
        <AwsButton variant="primary" onClick={() => onNavigate('/signup')}>I'm a customer</AwsButton>
        <AwsButton variant="outline" onClick={() => onNavigate('/signup-shop')}>I run a wrap shop</AwsButton>
      </nav>
      <div style={{ display: 'flex', gap: 16, marginTop: 16, fontSize: 13 }}>
        <a href="#" onClick={(e)=>{e.preventDefault();onNavigate('/vehicles/select');}} style={{ color: '#52525B', textDecoration: 'underline', textUnderlineOffset: 2 }}>Browse vehicles</a>
        <a href="#" onClick={(e)=>{e.preventDefault();onNavigate('/signin');}} style={{ color: '#52525B', textDecoration: 'underline', textUnderlineOffset: 2 }}>Sign in</a>
      </div>
    </main>
  );
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

function AuthPage({ mode = 'signup', onNavigate }) {
  const [password, setPassword] = usePagesState('');
  const strength = passwordStrength(password);
  const labels = ['Too weak', 'Weak', 'Okay', 'Strong', 'Excellent'];
  const colors = ['#EF4444', '#F97316', '#EAB308', '#84CC16', '#10B981'];

  return (
    <main style={{ minHeight: '100%', background: '#FAFAFA', display: 'flex', justifyContent: 'center', padding: '48px 16px' }}>
      <div style={{ width: '100%', maxWidth: 480, display: 'flex', flexDirection: 'column', gap: 24 }}>
        <header>
          <Eyebrow>Alpha Wolf Wrap Studio</Eyebrow>
          <h1 style={{ margin: '8px 0 0', fontSize: 24, fontWeight: 600, color: '#18181B', letterSpacing: '-0.01em' }}>
            {mode === 'signin' ? 'Sign in' : 'Create your account'}
          </h1>
          <p style={{ margin: '8px 0 0', fontSize: 14, color: '#52525B', lineHeight: 1.5 }}>
            {mode === 'signin' ? 'Welcome back — pick up where you left off.' : "We'll send a 6-digit OTP to verify your email."}
          </p>
        </header>
        <form style={{ display: 'flex', flexDirection: 'column', gap: 16 }} onSubmit={(e) => { e.preventDefault(); onNavigate('/welcome'); }}>
          {mode === 'signup' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <Label htmlFor="signup-fn">First name</Label>
                <Input id="signup-fn" />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <Label htmlFor="signup-ln">Last name</Label>
                <Input id="signup-ln" />
              </div>
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <Label htmlFor="signup-email">Email</Label>
            <Input id="signup-email" type="email" />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <Label htmlFor="signup-pw">Password</Label>
            <Input id="signup-pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <div style={{ marginTop: 8 }}>
              <div style={{ height: 6, width: '100%', borderRadius: 3, background: '#E4E4E7', overflow: 'hidden' }}>
                <div style={{ height: '100%', transition: 'width 200ms', width: `${(strength + 1) * 20}%`, background: colors[strength] }} />
              </div>
              <p style={{ margin: '6px 0 0', fontSize: 11, color: '#52525B' }}>
                {password.length ? labels[strength] : '12+ chars, 1 letter, 1 number, 1 symbol'}
              </p>
            </div>
          </div>
          <AwsButton variant="primary">{mode === 'signin' ? 'Sign in' : 'Create account'}</AwsButton>
        </form>
        <p style={{ margin: 0, fontSize: 13, color: '#52525B', textAlign: 'center' }}>
          {mode === 'signin'
            ? <>New here? <a href="#" onClick={(e)=>{e.preventDefault();onNavigate('/signup');}} style={{ color: '#18181B', fontWeight: 500 }}>Create an account →</a></>
            : <>Already have one? <a href="#" onClick={(e)=>{e.preventDefault();onNavigate('/signin');}} style={{ color: '#18181B', fontWeight: 500 }}>Sign in →</a></>}
        </p>
      </div>
    </main>
  );
}

// --- Welcome ---------------------------------------------------------------
function WelcomePage({ onNavigate }) {
  return (
    <main style={{ minHeight: '100%', background: '#FAFAFA', padding: '48px 16px' }}>
      <div style={{ margin: '0 auto', maxWidth: 672 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600, color: '#18181B' }}>You're in.</h1>
        <p style={{ margin: '8px 0 0', fontSize: 16, color: '#52525B' }}>Pick the vehicle you want to wrap to get started.</p>
        <div style={{ marginTop: 32, borderRadius: 12, border: '1px solid #E4E4E7', background: '#FFFFFF', padding: 32, textAlign: 'center' }}>
          <p style={{ margin: '0 0 16px', fontSize: 14, color: '#52525B' }}>Your design starts on an accurate vehicle outline.</p>
          <AwsButton variant="primary" onClick={() => onNavigate('/vehicles/select')}>Choose your vehicle</AwsButton>
        </div>
      </div>
    </main>
  );
}

// --- Vehicle select --------------------------------------------------------
function VehicleSelectPage({ onSelect, onNavigate }) {
  return (
    <main style={{ minHeight: '100%', background: '#FAFAFA', padding: '48px 16px' }}>
      <div style={{ margin: '0 auto', maxWidth: 1024 }}>
        <header style={{ marginBottom: 32 }}>
          <Eyebrow>Alpha Wolf Wrap Studio</Eyebrow>
          <h1 style={{ margin: '6px 0 0', fontSize: 24, fontWeight: 600, color: '#18181B', letterSpacing: '-0.01em' }}>Choose your vehicle</h1>
          <p style={{ margin: '8px 0 0', maxWidth: 640, fontSize: 14, color: '#52525B', lineHeight: 1.55 }}>
            Pick your exact year, make, model, and trim — or search — so your design starts on an accurate, wrap-safe outline.
          </p>
        </header>
        <VehicleBrowser onSelect={onSelect} />
      </div>
    </main>
  );
}

// --- Projects --------------------------------------------------------------
const SAMPLE_PROJECTS = [
  { id: 'prj-7f2a', name: 'Garage Cowboy fleet wrap', vehicle: '2024 Ford Transit 250', updated: 'May 25', bodyType: 'van' },
  { id: 'prj-9b3c', name: 'Casey HVAC primary van',   vehicle: '2024 Ford Transit 250', updated: 'May 24', bodyType: 'van' },
  { id: 'prj-2e1d', name: 'Brewers Bench color change', vehicle: '2024 Jeep Wrangler',   updated: 'May 18', bodyType: 'suv' },
];

function ProjectsPage({ onOpen, onNavigate, hasProjects = true }) {
  return (
    <main style={{ minHeight: '100%', background: '#FAFAFA', padding: '48px 16px' }}>
      <div style={{ margin: '0 auto', maxWidth: 1024 }}>
        <header style={{ marginBottom: 32, display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <Eyebrow>Alpha Wolf Wrap Studio</Eyebrow>
            <h1 style={{ margin: '6px 0 0', fontSize: 24, fontWeight: 600, color: '#18181B', letterSpacing: '-0.01em' }}>Your projects</h1>
            <p style={{ margin: '8px 0 0', maxWidth: 640, fontSize: 14, color: '#52525B', lineHeight: 1.55 }}>
              Pick up where you left off, or start a new wrap design from a vehicle template.
            </p>
          </div>
          <AwsButton variant="primary" onClick={() => onNavigate('/vehicles/select')}>New project</AwsButton>
        </header>

        {!hasProjects ? (
          <AwsCard dashed style={{ textAlign: 'center', padding: 32 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#18181B' }}>No projects yet</h3>
              <p style={{ margin: 0, fontSize: 14, color: '#52525B' }}>Choose a vehicle template and start your first wrap design.</p>
              <div style={{ marginTop: 12 }}><AwsButton variant="primary" onClick={() => onNavigate('/vehicles/select')}>Start your first project</AwsButton></div>
            </div>
          </AwsCard>
        ) : (
          <ul style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, padding: 0, listStyle: 'none', margin: 0 }}>
            {SAMPLE_PROJECTS.map((p) => (
              <li key={p.id}>
                <AwsCard hoverable style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                  <div style={{ padding: '24px 24px 0' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                      <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#18181B', lineHeight: 1.3 }} title={p.name}>{p.name}</h3>
                      <button style={{ border: 0, background: 'transparent', cursor: 'pointer', padding: 4, color: '#71717A' }} aria-label="More"><IconMore size={16} /></button>
                    </div>
                    <p style={{ margin: '6px 0 0', fontSize: 13, color: '#71717A' }}>Updated {p.updated} · {p.vehicle}</p>
                  </div>
                  <div style={{ padding: '12px 24px 24px', marginTop: 'auto' }}>
                    <AwsButton variant="outline" size="sm" onClick={() => onOpen?.(p)}>Open</AwsButton>
                  </div>
                </AwsCard>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}

// --- App shell header (for project + editor routes) -----------------------
function AppHeader({ user = 'casey@example.com', onNavigate, currentPath }) {
  return (
    <header style={{ borderBottom: '1px solid #E4E4E7', background: '#FFFFFF' }}>
      <div style={{ margin: '0 auto', maxWidth: 1280, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '10px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <a href="#" onClick={(e)=>{e.preventDefault();onNavigate('/projects');}} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: '#18181B', textDecoration: 'none' }}>
            <img src="../../assets/logo.png" alt="" style={{ height: 22, width: 'auto', display: 'block' }} />
            <span style={{ fontSize: 13, fontWeight: 600 }}>Wrap Studio</span>
          </a>
          <nav style={{ display: 'flex', gap: 4, fontSize: 13 }}>
            {[['/projects','Projects'],['/vehicles/select','Vehicles'],['/admin','Admin']].map(([h,l]) => (
              <a key={h} href="#" onClick={(e)=>{e.preventDefault();onNavigate(h);}} style={{ padding: '6px 10px', borderRadius: 6, color: currentPath === h ? '#18181B' : '#52525B', textDecoration: 'none', fontWeight: 500, background: currentPath === h ? '#F4F4F5' : 'transparent' }}>{l}</a>
            ))}
          </nav>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13 }}>
          <span style={{ color: '#71717A' }}>{user}</span>
          <button style={{ border: 0, background: 'transparent', color: '#52525B', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 2, padding: 0 }}>Sign out</button>
        </div>
      </div>
    </header>
  );
}

Object.assign(window, { HomePage, AuthPage, WelcomePage, VehicleSelectPage, ProjectsPage, AppHeader, SAMPLE_PROJECTS });
