export type PhoneDemoQuery = Record<string, string | string[] | undefined>;

const scenarios = [
  ['normal', 'Everyday'],
  ['problem', 'Something to solve'],
  ['first', 'A first hello'],
  ['quiet', 'A quiet day'],
  ['night', 'After hours'],
] as const;

/** Only supported presentation controls cross into the app viewport. */
export function phoneExperienceSource(query: PhoneDemoQuery = {}) {
  const params = new URLSearchParams();
  if (query.utility === 'call' || query.utility === 'world' || query.utility === 'hatch') params.set('utility', query.utility);
  if (query.presenter === '1') params.set('presenter', '1');
  if (typeof query.state === 'string' && scenarios.some(([state]) => state === query.state)) params.set('state', query.state);
  return '/experience' + (params.size ? '?' + params.toString() : '');
}

export default function PhoneDemo({query = {}}: {query?: PhoneDemoQuery}) {
  const presenting = query.presenter === '1' || scenarios.some(([state]) => state === query.state);
  return <main className="phone-demo" data-presenter={presenting}>
    <header className="phone-demo-heading">
      <h1>COUPI <span>— the store that becomes someone</span></h1>
      <p>Coupang reimagined: AI as the primary interface. A concept simulation.</p>
      <nav className="phone-demo-modes" aria-label="Demo presentation">
        <a href="/" aria-current={!presenting && query.utility !== 'hatch' ? 'page' : undefined}>Live app</a>
        <span aria-hidden="true"/>
        <a href="/?utility=hatch" aria-current={query.utility === 'hatch' ? 'page' : undefined}>Meet Coopy</a>
        <span aria-hidden="true"/>
        <a href="/?presenter=1&state=normal" aria-current={presenting ? 'page' : undefined}>Home scenarios</a>
      </nav>
      {presenting && <nav className="phone-demo-scenarios" aria-label="Prepared homepage scenarios">
        {scenarios.map(([state, label]) => <a key={state} href={`/?presenter=1&state=${state}`} aria-current={(query.state || 'normal') === state ? 'page' : undefined}>{label}</a>)}
      </nav>}
    </header>
    <section className="phone-demo-device" aria-label="COUPI phone demo">
      <div className="phone-demo-screen">
        <iframe src={phoneExperienceSource(query)} title="COUPI interactive app" allow="camera; microphone; autoplay" className="phone-demo-app"/>
      </div>
    </section>
    <p className="phone-demo-badge"><i aria-hidden="true"/>SIMULATION — SYNTHETIC CATALOG &amp; ORDERS</p>
  </main>;
}
