// Vehicle browser, vehicle card, and outline previews for the Wrap Studio app.
// Models the cascade behaviour from components/vehicles/VehicleBrowser.tsx.

const { useState, useMemo } = React;

// --- Outline silhouettes (line-drawn 4-view stand-ins) --------------------
function PickupOutline() {
  return (
    <svg viewBox="0 0 320 80" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
      <g fill="none" stroke="#27272A" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round">
        <path d="M 20 58 L 20 42 Q 20 36 26 36 L 70 36 L 90 22 L 130 22 Q 138 22 142 30 L 150 38 L 280 38 Q 290 38 290 48 L 290 58" />
        <line x1="20" y1="58" x2="290" y2="58" />
        <line x1="150" y1="38" x2="150" y2="58" />
        <circle cx="70" cy="58" r="9" fill="#FFFFFF" />
        <circle cx="240" cy="58" r="9" fill="#FFFFFF" />
        <circle cx="70" cy="58" r="3.5" fill="#27272A" />
        <circle cx="240" cy="58" r="3.5" fill="#27272A" />
        <rect x="92" y="26" width="38" height="14" rx="2" fill="none" stroke="#A1A1AA" strokeWidth="1.2" />
        <line x1="111" y1="26" x2="111" y2="40" stroke="#A1A1AA" strokeWidth="1" />
      </g>
    </svg>
  );
}
function VanOutline() {
  return (
    <svg viewBox="0 0 320 80" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
      <g fill="none" stroke="#27272A" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round">
        <path d="M 22 58 L 22 24 Q 22 18 28 18 L 250 18 Q 270 18 285 32 L 295 50 Q 297 58 290 58" />
        <line x1="22" y1="58" x2="290" y2="58" />
        <circle cx="62" cy="58" r="9" fill="#FFFFFF" />
        <circle cx="240" cy="58" r="9" fill="#FFFFFF" />
        <circle cx="62" cy="58" r="3.5" fill="#27272A" />
        <circle cx="240" cy="58" r="3.5" fill="#27272A" />
        <rect x="28" y="22" width="40" height="16" rx="2" fill="none" stroke="#A1A1AA" strokeWidth="1.2" />
        <line x1="100" y1="18" x2="100" y2="58" stroke="#A1A1AA" strokeWidth="1.2" />
        <rect x="220" y="22" width="56" height="24" rx="2" fill="none" stroke="#A1A1AA" strokeWidth="1.2" />
      </g>
    </svg>
  );
}
function SuvOutline() {
  return (
    <svg viewBox="0 0 320 80" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
      <g fill="none" stroke="#27272A" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round">
        <path d="M 22 56 L 22 44 Q 22 38 30 38 L 60 30 Q 70 24 90 24 L 220 24 Q 240 24 252 32 L 280 38 Q 295 38 295 48 L 295 56" />
        <line x1="22" y1="56" x2="295" y2="56" />
        <path d="M 72 30 L 130 26 L 200 26 L 235 32 L 240 38 L 72 38 Z" fill="#000000" opacity="0.85" />
        <line x1="130" y1="26" x2="130" y2="38" stroke="#A1A1AA" strokeWidth="1" />
        <line x1="180" y1="26" x2="180" y2="38" stroke="#A1A1AA" strokeWidth="1" />
        <circle cx="78" cy="56" r="10" fill="#FFFFFF" />
        <circle cx="240" cy="56" r="10" fill="#FFFFFF" />
        <circle cx="78" cy="56" r="4" fill="#27272A" />
        <circle cx="240" cy="56" r="4" fill="#27272A" />
      </g>
    </svg>
  );
}

const OUTLINE_BY_TYPE = { pickup: PickupOutline, van: VanOutline, sprinter: VanOutline, suv: SuvOutline };

function OutlinePreview({ bodyType, className = '' }) {
  const C = OUTLINE_BY_TYPE[bodyType] || PickupOutline;
  return (
    <div className={className} style={{ width: '100%', background: '#F4F4F5', borderBottom: '1px solid #E4E4E7', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '14px 24px' }}>
      <div style={{ width: '70%', height: 60 }}>
        <C />
      </div>
    </div>
  );
}

// --- Sample vehicle data --------------------------------------------------
const SAMPLE_VEHICLES = [
  { id: 'ford-transit-250-148wb-hr', year: 2024, make: 'Ford', model: 'Transit 250', trim: '148″WB High Roof', bodyType: 'van', dims: '236.7″ L · 110.0″ H · 81.3″ W' },
  { id: 'ford-transit-350-el-hr',   year: 2024, make: 'Ford', model: 'Transit 350', trim: 'EL High Roof',     bodyType: 'van', dims: '263.9″ L · 110.0″ H · 81.3″ W' },
  { id: 'ford-f150-supercrew-65',   year: 2024, make: 'Ford', model: 'F-150',       trim: 'SuperCrew 6.5′',   bodyType: 'pickup', dims: '243.7″ L · 77.2″ H · 79.9″ W' },
  { id: 'ford-f150-supercrew-55',   year: 2024, make: 'Ford', model: 'F-150',       trim: 'SuperCrew 5.5′',   bodyType: 'pickup', dims: '231.7″ L · 77.2″ H · 79.9″ W' },
  { id: 'chev-silverado-1500-cc',   year: 2024, make: 'Chevrolet', model: 'Silverado 1500', trim: 'Crew Cab', bodyType: 'pickup', dims: '241.2″ L · 75.5″ H · 81.2″ W' },
  { id: 'ram-promaster-2500-hr',    year: 2024, make: 'Ram',  model: 'ProMaster 2500', trim: 'High Roof',     bodyType: 'sprinter', dims: '236.0″ L · 100.7″ H · 82.8″ W' },
  { id: 'mb-sprinter-2500-170',     year: 2024, make: 'Mercedes-Benz', model: 'Sprinter 2500', trim: '170″WB High Roof', bodyType: 'sprinter', dims: '274.3″ L · 107.5″ H · 79.7″ W' },
  { id: 'toyota-tacoma-dc',         year: 2024, make: 'Toyota', model: 'Tacoma',     trim: 'Double Cab',      bodyType: 'pickup', dims: '212.3″ L · 71.6″ H · 75.2″ W' },
  { id: 'jeep-wrangler-4door',      year: 2024, make: 'Jeep', model: 'Wrangler',    trim: '4-Door Sport',    bodyType: 'suv', dims: '188.2″ L · 73.6″ H · 73.8″ W' },
];

// --- VehicleCard ----------------------------------------------------------
function VehicleCard({ vehicle, onUse }) {
  const [hover, setHover] = useState(false);
  const title = `${vehicle.year} ${vehicle.make} ${vehicle.model}${vehicle.trim ? ' · ' + vehicle.trim : ''}`;
  return (
    <article
      style={{
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        borderRadius: 12, border: '1px solid #E4E4E7', background: '#FFFFFF',
        boxShadow: hover ? '0 4px 6px -1px rgba(0,0,0,.1), 0 2px 4px -2px rgba(0,0,0,.05)' : '0 1px 3px rgba(0,0,0,.08)',
        transition: 'box-shadow 200ms',
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <OutlinePreview bodyType={vehicle.bodyType} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 16, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#18181B' }}>{title}</h3>
          <span style={{ flexShrink: 0, borderRadius: 9999, background: '#F4F4F5', padding: '2px 8px', fontSize: 11, color: '#52525B', textTransform: 'capitalize' }}>{vehicle.bodyType}</span>
        </div>
        <p style={{ margin: 0, fontSize: 12, color: '#71717A', fontFamily: 'var(--font-mono)' }}>{vehicle.dims}</p>
        <AwsButton variant="primary" size="default" onClick={() => onUse?.(vehicle)} style={{ marginTop: 'auto' }}>Use this template</AwsButton>
      </div>
    </article>
  );
}

// --- VehicleBrowser -------------------------------------------------------
function VehicleBrowser({ onSelect }) {
  const [sel, setSel] = useState({ year: '', make: '', model: '', trim: '', cabSize: '', roofHeight: '' });
  const [query, setQuery] = useState('');

  const years = [2024, 2023, 2022, 2021, 2020];
  const makes = useMemo(() => Array.from(new Set(SAMPLE_VEHICLES.filter((v) => !sel.year || v.year === Number(sel.year)).map((v) => v.make))), [sel.year]);
  const models = useMemo(() => Array.from(new Set(SAMPLE_VEHICLES.filter((v) => (!sel.year || v.year === Number(sel.year)) && (!sel.make || v.make === sel.make)).map((v) => v.model))), [sel.year, sel.make]);
  const trims = useMemo(() => SAMPLE_VEHICLES.filter((v) => (!sel.year || v.year === Number(sel.year)) && (!sel.make || v.make === sel.make) && (!sel.model || v.model === sel.model)).map((v) => v.trim), [sel.year, sel.make, sel.model]);

  const results = useMemo(() => {
    if (query.trim().length >= 2) {
      const q = query.toLowerCase();
      return SAMPLE_VEHICLES.filter((v) => `${v.year} ${v.make} ${v.model} ${v.trim}`.toLowerCase().includes(q));
    }
    return SAMPLE_VEHICLES.filter((v) => {
      if (sel.year && v.year !== Number(sel.year)) return false;
      if (sel.make && v.make !== sel.make) return false;
      if (sel.model && v.model !== sel.model) return false;
      if (sel.trim && v.trim !== sel.trim) return false;
      return true;
    });
  }, [sel, query]);

  const showRoof = results.some((v) => v.bodyType === 'van' || v.bodyType === 'sprinter');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <Label htmlFor="vb-search">Search</Label>
        <Input id="vb-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. 2024 transit 250 high roof" />
        <p style={{ margin: '2px 0 0', fontSize: 11, color: '#71717A' }}>Typo-tolerant — "transt 250" finds Transit 250.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <Label htmlFor="vb-year">Year</Label>
          <Select id="vb-year" value={sel.year} onChange={(v) => setSel({ year: v, make: '', model: '', trim: '', cabSize: '', roofHeight: '' })} options={years.map((y) => ({ value: y, label: y }))} placeholder="Select year" />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <Label htmlFor="vb-make">Make</Label>
          <Select id="vb-make" disabled={!sel.year} value={sel.make} onChange={(v) => setSel((s) => ({ ...s, make: v, model: '', trim: '' }))} options={makes.map((m) => ({ value: m, label: m }))} placeholder="Select make" />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <Label htmlFor="vb-model">Model</Label>
          <Select id="vb-model" disabled={!sel.make} value={sel.model} onChange={(v) => setSel((s) => ({ ...s, model: v, trim: '' }))} options={models.map((m) => ({ value: m, label: m }))} placeholder="Select model" />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <Label htmlFor="vb-trim">Trim</Label>
          <Select id="vb-trim" disabled={!sel.model} value={sel.trim} onChange={(v) => setSel((s) => ({ ...s, trim: v }))} options={trims.map((t) => ({ value: t, label: t }))} placeholder="Any trim" />
        </div>
      </div>

      {sel.model && showRoof && (
        <fieldset style={{ display: 'flex', flexDirection: 'column', gap: 12, borderRadius: 8, border: '1px solid #E4E4E7', background: '#FAFAFA', padding: 16, margin: 0 }}>
          <legend style={{ padding: '0 4px', fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.10em', color: '#71717A' }}>Configuration</legend>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <Label htmlFor="vb-roof">Roof height</Label>
              <Select id="vb-roof" value={sel.roofHeight} onChange={(v) => setSel((s) => ({ ...s, roofHeight: v }))} options={[{value:'low',label:'Low'},{value:'mid',label:'Mid'},{value:'high',label:'High'}]} placeholder="Any roof" />
            </div>
          </div>
        </fieldset>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <p style={{ margin: 0, fontSize: 13, color: '#52525B' }} aria-live="polite">
          {query.trim().length >= 2
            ? `${results.length} match${results.length === 1 ? '' : 'es'} for "${query}"`
            : results.length > 0
              ? `${results.length} template${results.length === 1 ? '' : 's'}`
              : 'Pick a vehicle above or search to begin.'}
        </p>
        {results.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            {results.map((v) => <VehicleCard key={v.id} vehicle={v} onUse={onSelect} />)}
          </div>
        )}
      </div>

      <p style={{ margin: 0, textAlign: 'center', fontSize: 13, color: '#71717A' }}>
        <a href="#" onClick={(e)=>e.preventDefault()} style={{ fontWeight: 500, color: '#18181B', textDecoration: 'none' }}>Don't see your vehicle? Request it →</a>
      </p>
    </div>
  );
}

Object.assign(window, { OutlinePreview, VehicleCard, VehicleBrowser, SAMPLE_VEHICLES });
