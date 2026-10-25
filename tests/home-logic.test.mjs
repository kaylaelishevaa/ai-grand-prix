import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
import sourceCatalog from '../data/catalog.json' with { type: 'json' };
import {demoCatalog} from '../lib/demo-catalog.mjs';
const catalog=demoCatalog(sourceCatalog);
import { buildCards, buildBrief, deriveState, createDemoScenario, HOME_MOODS, HOME_LINES, PRESENTER_STATES } from '../public/home.js';
import { coupiSVG } from '../public/coupi.js';
import { readMemorySettings } from '../public/settings.js';

const now = new Date(2026, 9, 26, 8, 10);
const stamp = (day, hour = 8, minute = 0) => new Date(2026, 9, day, hour, minute).toISOString();
const base = () => ({ catalog, orders: [], decisions: [], saved: [], held: [], memory: [], user: { name: 'Mina' } });
const waiting = (item = '7612276799') => ({ item, status: 'waiting', addedAt: stamp(25) });
const arriving = (items = ['55518713']) => ({ id: 'arrival', items, status: 'out_for_delivery', eta: stamp(26, 12) });
const delivered = (at = stamp(25)) => ({ id: 'delivered', items: ['1814412512'], status: 'delivered', deliveredAt: at });
const saved = (item = '7185725748') => ({ item, event: 'back_in_stock', savedAt: stamp(21) });
const delayed = () => ({ id: 'late', items: ['6566125679'], status: 'delayed', eta: '2026-10-30', originalEta: '2026-10-28', swap: { item: '7330605115', eta: '2026-10-27', priceDelta: 37930 } });

test('higher priorities win and three higher cards suppress all nudges', () => {
  const data = { ...base(), orders: [delivered(), arriving()], decisions: [waiting()], saved: [saved()] };
  assert.deepEqual(buildCards(data, now).map(c => c.type), ['decision', 'arrival', 'followup']);
});

test('normal day has at most three cards and at most one evidence-backed nudge', () => {
  const data = { ...base(), orders: [arriving()], decisions: [waiting()], saved: [saved(), saved('7322824636')] };
  assert.deepEqual(buildCards(data, now).map(c => c.type), ['decision', 'arrival', 'nudge']);
  assert.equal(buildCards({ ...base(), saved: data.saved }, now).length, 1);
  assert.match(buildCards(data, now)[2].reason, /You saved it on/);
});

test('any problem puts problems first, caps cards at two and forbids nudges', () => {
  const data = { ...base(), orders: [arriving(), delayed(), delivered()], decisions: [waiting()], saved: [saved()], held: [{ item: '7322824636', heldUntil: stamp(27, 7) }] };
  assert.deepEqual(buildCards(data, now).map(c => c.type), ['problem', 'decision']);
  assert.equal(deriveState(data, now), 'problem');
  data.decisions = []; data.orders = [delayed()];
  assert.deepEqual(buildCards(data, now).map(c => c.type), ['problem']);
});

test('multiple problems sort by urgency before other types', () => {
  const data = { ...base(), orders: [delayed(), { id: 'earlier', items: ['55518713'], status: 'delayed', originalEta: stamp(24), eta: stamp(28) }, { id: 'earliest', items: ['7612276799'], status: 'pickup_due', pickupAt: stamp(23) }], decisions: [waiting()] };
  assert.deepEqual(buildCards(data, now).map(c => c.source.id), ['earliest', 'earlier']);
});

test('late delivery, due pickup, return input and exchange input are problems', () => {
  for (const facts of [{ status: 'shipped', eta: stamp(25) }, { status: 'pickup_due' }, { status: 'return_needs_input' }, { status: 'exchange', needsInput: true }, { status: 'return', pickupAt: stamp(26, 14) }]) {
    const data = { ...base(), orders: [{ id: 'problem', items: ['55518713'], ...facts }] };
    assert.equal(buildCards(data, now)[0].type, 'problem', JSON.stringify(facts));
  }
});

test('date-only arrivals are not late at midnight; cancelled orders stay absent', () => {
  const data = { ...base(), orders: [{ ...arriving(), eta: '2026-10-26' }, { ...delayed(), status: 'cancelled' }] };
  assert.deepEqual(buildCards(data, now).map(c => c.type), ['arrival']);
  assert.equal(buildCards({ ...base(), orders: [{ ...arriving(), eta: '2026-10-25' }] }, now)[0].type, 'problem');
});

test('arrivals include today and tomorrow, ordered by ETA, excluding later days', () => {
  const data = { ...base(), orders: [{ ...arriving(['7612276799']), id: 'tomorrow', eta: stamp(27) }, { ...arriving(['6566125679']), id: 'later', eta: stamp(28) }, arriving()] };
  assert.deepEqual(buildCards(data, now).map(c => c.source.id), ['arrival', 'tomorrow']);
});

test('quote window is inclusive at 24 hours and ended decisions stay absent', () => {
  const data = { ...base(), decisions: [waiting('1814412512'), { item: '7612276799', status: 'quoted', expiresAt: new Date(+now + 86400000).toISOString() }, { item: '55518713', status: 'quoted', expiresAt: new Date(+now + 86400001).toISOString() }, { item: '6566125679', status: 'approved', expiresAt: stamp(26, 9) }] };
  assert.deepEqual(buildCards(data, now).map(c => c.product.id), ['7612276799', '1814412512']);
});

test('same-type urgency sorts expiring decisions, then oldest waiting decisions', () => {
  const data = { ...base(), decisions: [{ ...waiting('55518713'), addedAt: stamp(26) }, { item: '7612276799', status: 'quoted', expiresAt: stamp(26, 9) }, waiting('1814412512')] };
  assert.deepEqual(buildCards(data, now).map(c => c.product.id), ['7612276799', '1814412512', '55518713']);
});

test('follow-ups include the last three days, excluding future, older and rated deliveries', () => {
  const atBoundary = new Date(+now - 3 * 86400000).toISOString();
  for (const [at, count] of [[atBoundary, 1], [new Date(+now - 3 * 86400000 - 1).toISOString(), 0], [stamp(27), 0]]) {
    assert.equal(buildCards({ ...base(), orders: [delivered(at)] }, now).length, count);
  }
  assert.equal(buildCards({ ...base(), orders: [{ ...delivered(), rated: 4 }] }, now).length, 0);
});

test('nudges never recommend owned items, even after follow-up expires', () => {
  const data = { ...base(), orders: [delivered(stamp(20))], owned: ['7185725748'], saved: [saved(), saved('1814412512')], held: [{ item: '1814412512', heldUntil: stamp(27, 7) }] };
  assert.deepEqual(buildCards(data, now), []);
});

test('unknown catalog ids and nudges without dated evidence are excluded', () => {
  const data = { ...base(), decisions: [waiting('unknown')], orders: [arriving(['unknown'])], saved: [{ item: '7185725748', event: 'back_in_stock' }, { ...saved(), savedAt: stamp(27) }, { ...saved(), event: 'popular' }], held: [{ item: '7322824636' }] };
  assert.deepEqual(buildCards(data, now), []);
});

test('night boundaries are 22:00 inclusive to 07:00 exclusive in local time', () => {
  for (const [hour, minute, expected] of [[21, 59, 'quiet'], [22, 0, 'night'], [0, 0, 'night'], [6, 59, 'night'], [7, 0, 'quiet']]) {
    assert.equal(deriveState(base(), new Date(2026, 9, 26, hour, minute)), expected);
  }
  assert.equal(deriveState({ ...base(), orders: [delayed()] }, new Date(2026, 9, 26, 23)), 'problem');
});

test('URL override beats demoState; invalid overrides fall through to data and time', () => {
  const data = { ...base(), demoState: 'quiet', decisions: [waiting()] };
  assert.equal(deriveState(data, now, 'night'), 'night');
  assert.equal(deriveState(data, now, 'invalid'), 'quiet');
  assert.equal(deriveState({ ...data, demoState: null }, now, 'invalid'), 'normal');
  assert.equal(deriveState(data, now, 'first'), 'first');
});

test('held overnight card provides evidence and the exact release time', () => {
  const cards = buildCards({ ...base(), held: [{ item: '7322824636', addedAt: stamp(26, 22), heldUntil: stamp(27, 7) }] }, new Date(2026, 9, 26, 23));
  assert.equal(cards[0].kind, 'held'); assert.match(cards[0].line, /7am.*₩35,700/);
  assert.equal(buildBrief(cards, 'night', 'Mina'), HOME_LINES.night);
});

test('the agreed state lines are exact; fallback briefs remain short and grounded', () => {
  const context = { window: { COUPANG_PRODUCTS: catalog } };
  vm.runInNewContext(readFileSync(new URL('../public/home-demo-data.js', import.meta.url), 'utf8'), context);
  for (const [state, line] of Object.entries(HOME_LINES)) {
    const when = new Date(2026, 9, 26, state === 'night' ? 23 : 8, 10);
    const data = createDemoScenario(context.window.HOME_DEMO, state, when);
    assert.equal(buildBrief(buildCards(data, when), state, 'Mina'), line);
    assert(line.split(/\s+/).length <= 20);
  }
  const card = buildCards({ ...base(), orders: [arriving()] }, now)[0];
  assert.match(buildBrief([card], 'normal', 'Mina'), /lamp arrives today/);
  assert.doesNotMatch(buildBrief([card], 'normal', 'Mina'), /glasses/);
  const long = buildBrief([{ type: 'arrival', title: 'Long '.repeat(50) }], 'offline', 'Mina');
  assert(long.split(/\s+/).length <= 20);
});

test('night brief uses the agreed hold line even when an arrival outranks it', () => {
  const data = { ...base(), orders: [{ ...arriving(), eta: stamp(27, 7) }], held: [{ item: '7322824636', heldUntil: stamp(27, 7) }] };
  assert.equal(buildBrief(buildCards(data, new Date(2026, 9, 26, 23)), 'night', 'Mina'), HOME_LINES.night);
});

test('rules and demo scenarios never mutate their input', () => {
  const data = { ...base(), orders: [delayed(), arriving()], decisions: [waiting()], saved: [saved()] };
  const before = structuredClone(data);
  buildCards(data, now); deriveState(data, now); createDemoScenario(data, 'quiet', now);
  assert.deepEqual(data, before);
});

test('demo uses the real loaded catalog, with local product photos and known ids', () => {
  const context = { window: { COUPANG_PRODUCTS: catalog } };
  vm.runInNewContext(readFileSync(new URL('../public/home-demo-data.js', import.meta.url), 'utf8'), context);
  const data = context.window.HOME_DEMO;
  const ids = [...data.orders.flatMap(o => [...o.items, ...(o.swap ? [o.swap.item] : [])]), ...data.decisions.map(d => d.item), ...data.saved.map(s => s.item), ...data.held.map(h => h.item)];
  for (const id of ids) {
    const p = data.catalog.find(p => p.id === id); assert(p?.name); assert(p.price > 0);
    assert(existsSync(new URL('../public' + p.image, import.meta.url)));
  }
  assert.equal(buildCards(createDemoScenario(data, 'normal', now), now).length, 3);
  assert.deepEqual(buildCards(createDemoScenario(data, 'problem', now), now).map(c => c.type), ['problem', 'decision']);
  assert.equal(buildCards(createDemoScenario(data, 'quiet', now), now).length, 0);
  assert.equal(buildCards(createDemoScenario(data, 'first', now), now)[0].type, 'arrival');
});

test('shared art exposes every mood and safely accepts replaceable colours and size', () => {
  for (const mood of ['calm', 'excited', 'attentive', 'sleepy', 'listening', 'thinking', 'relaxed']) {
    const svg = coupiSVG(mood, 150, '#5B8FD6', '#E8A87C');
    assert.match(svg, new RegExp('COUPI, ' + mood)); assert.match(svg, /width="150"/); assert.match(svg, /#5B8FD6/);
  }
  assert.doesNotMatch(coupiSVG('" onload="alert(1)', 150, '" onload="alert(1)'), /onload/);
});

test('every page uses the team shell navigation and current routes', () => {
  for (const page of ['main', 'camera', 'explore', 'settings']) {
    const html = readFileSync(new URL('../site-pages/' + page + '.html', import.meta.url), 'utf8');
    const nav = html.match(/<nav class="app-nav"[\s\S]+?<\/nav>/)[0];
    assert.deepEqual([...nav.matchAll(/<span>([^<]+)<\/span>/g)].map(m => m[1]), ['Home', 'Call', 'Explore']);
    for (const route of ['/', '/call', '/explore']) assert(nav.includes('href="' + route + '"'));
    assert.doesNotMatch(html, /home\.html|coupi-head|tabbar\.js/);
    if (page !== 'settings') assert.match(nav, new RegExp('href="' + ({main: '/', camera: '/call', explore: '/explore'})[page] + '" aria-current="page"'));
  }
  for (const removed of ['public/tabbar.js', 'public/coupi-head.js', 'site-pages/home.html', 'site-pages/coupi-head.html']) assert.equal(existsSync(new URL('../' + removed, import.meta.url)), false);
  const main = readFileSync(new URL('../site-pages/main.html', import.meta.url), 'utf8');
  assert.match(main, /<title>Home — Coupi<\/title>/);
  assert.match(main, /<main class="shell-content"[^>]*>\s*<div id="coupi-home"/);
  assert.match(main, /<h1 class="home-sr-only">Home<\/h1>/);
  const routes = readFileSync(new URL('../worker/index.ts', import.meta.url), 'utf8');
  assert.match(routes, /pagePath === '\/settings' \? settingsPage/);
});

test('forgotten memories remain empty and settings survive reload without reseeding', () => {
  const values = new Map([['coupi_memory', '[]'], ['coupi_permissions', '{"holdLateNight":false}'], ['coupi_memory_paused', '1']]);
  const settings = readMemorySettings({ getItem: key => values.get(key) || null }, [{ text: 'Seed', source: 'first call' }]);
  assert.deepEqual(settings.memories, []); assert.equal(settings.permissions.holdLateNight, false); assert.equal(settings.permissions.askBeforeBuying, true); assert.equal(settings.paused, true);
  assert.equal(readMemorySettings(undefined, [{ text: 'Seed', source: 'first call' }]).memories.length, 1);
});

// Controller tests use the real HTML IDs and a minimal DOM, without a browser or network.
function homeFixture(state, customize = data => data, options = {}) {
  const html = readFileSync(new URL('../site-pages/main.html', import.meta.url), 'utf8');
  let document;
  class Element {
    constructor() { this.innerHTML = ''; this.textContent = ''; this.dataset = {}; this.attributes = {}; this.listeners = new Map(); this.open = false; this.isConnected = true; this.hidden = true; }
    setAttribute(key, value) { this.attributes[key] = value; }
    addEventListener(key, fn) { this.listeners.set(key, fn); }
    emit(key, value) { this.listeners.get(key)?.(value); }
    showModal() { this.open = true; }
    close() { this.open = false; this.emit('close'); }
    focus() { document.activeElement = this; }
  }
  const nodes = new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(m => [m[1], new Element()]));
  const meta = new Element(), timers = new Map(), session = options.session || new Map();
  let nextTimer = 0;
  document = { body: new Element(), activeElement: nodes.get('home-decisions'), getElementById: id => nodes.get(id), querySelector: () => meta };
  const context = { window: { COUPANG_PRODUCTS: catalog, addEventListener() {} }, document, location: { pathname: '/', search: options.query || (state ? '?state=' + state : '') }, history: { replaceState(...args) { context.lastURL = args[2]; } }, localStorage: { getItem() { return null; } }, sessionStorage: { getItem: key => session.get(key) || null, setItem: (key, value) => session.set(key, value) }, URLSearchParams, coupiSVG, setTimeout(fn, ms) { timers.set(++nextTimer, { fn, ms }); return nextTimer; }, clearTimeout(id) { timers.delete(id); } };
  vm.createContext(context);
  vm.runInContext(readFileSync(new URL('../public/home-demo-data.js', import.meta.url), 'utf8'), context);
  context.window.HOME_DEMO = customize(context.window.HOME_DEMO);
  const source = readFileSync(new URL('../public/home.js', import.meta.url), 'utf8').replace(/^import .+;\n/gm, '').replace(/^export /gm, '');
  vm.runInContext(source, context);
  const act = (action, id, rating) => nodes.get('home-sheet-body').emit('click', { target: { closest: () => ({ dataset: { homeAction: action, card: id, rating } }) } });
  return { nodes, document, act, session, timers, context, cards: () => nodes.get('home-cards').innerHTML, body: () => nodes.get('home-sheet-body').innerHTML, close: () => nodes.get('home-sheet').close() };
}

test('every Home state boots its real controller and renders the intended mood and card limit', () => {
  for (const state of Object.keys(HOME_MOODS)) {
    const f = homeFixture(state);
    assert.equal(f.document.body.dataset.state, state);
    assert(f.nodes.get('home-brief').textContent.length);
    const count = [...f.cards().matchAll(/<article /g)].length;
    assert(count <= (state === 'problem' ? 2 : 3));
    assert.match(f.nodes.get('home-avatar').innerHTML, new RegExp('COUPI, ' + (state === 'loading' ? 'calm' : HOME_MOODS[state])));
    if (state === 'first') assert.match(f.cards(), /I learned 3 things/);
    if (state === 'quiet') { assert.equal(count, 1); assert.match(f.cards(), /home-card world/); }
    if (state === 'loading') assert.match(f.cards(), /home-loading/);
  }
});

test('opening and dismissing either problem sheet changes nothing until a choice', () => {
  const f = homeFixture('problem'), before = f.cards(), id = 'problem:1044:6566125679';
  f.act('open', id); assert.match(f.body(), /Get it tomorrow/); assert.match(f.body(), /₩37,930/); f.close();
  assert.equal(f.cards(), before);
  f.act('options', id); assert.match(f.body(), /Wait for Friday/); assert.match(f.body(), /Cancel this item/); f.close();
  assert.equal(f.cards(), before);
  f.act('open', id); f.act('swap', id);
  assert.doesNotMatch(f.cards(), /home-card problem/);
  assert.match(f.nodes.get('home-status').textContent, /Your choice is saved/);
});

test('review, track, and evidence-backed product sheets use customer copy and explicit choices', () => {
  const f = homeFixture('normal');
  f.act('open', 'decision:7612276799:7612276799');
  assert.match(f.body(), /₩19,900/); assert.match(f.body(), /Buy for ₩19,900/);
  f.act('approve', '7612276799'); assert.doesNotMatch(f.cards(), /home-card decision/);
  assert.match(f.nodes.get('home-status').textContent, /No order has been placed/);
  f.act('open', 'arrival:1043:55518713');
  for (const stage of ['Ordered', 'Packed', 'Out for delivery', 'Delivered']) assert.match(f.body(), new RegExp(stage));
  assert.match(f.body(), /aria-current="step">Out for delivery/); f.close();
  f.act('open', 'nudge:7185725748:7185725748');
  assert.match(f.body(), /Why this is here/); assert.match(f.body(), /You saved it on/);
  f.act('add-decision', 'nudge:7185725748:7185725748');
  assert.match(f.cards(), /home-card decision/); assert.doesNotMatch(f.cards(), /home-card nudge/);
});

test('Wait for Friday keeps the original chair and clears the delivery problem', () => {
  const f = homeFixture('problem');
  assert.match(f.cards(), /data-home-action="wait"[^>]+>Wait for Friday/);
  f.act('wait', 'problem:1044:6566125679');
  assert.doesNotMatch(f.cards(), /home-card problem/);
  assert.doesNotMatch(f.nodes.get('home-brief').textContent, /chair is running late/);
  assert.equal(f.nodes.get('home-status').textContent, 'Your choice is saved.');
});

test('night Remove clears the held item directly and from Decisions', () => {
  const f = homeFixture('night');
  assert.match(f.cards(), /MAC Powder Kiss/);
  assert.match(f.cards(), /ask you again at 7am/);
  assert.match(f.cards(), /data-home-action="remove-held"/);
  f.nodes.get('home-decisions').emit('click'); assert.match(f.body(), /Held until 07:00/);
  f.act('remove-held', '7322824636');
  f.nodes.get('home-decisions').emit('click'); assert.match(f.body(), /Nothing is waiting/);
  assert.doesNotMatch(f.cards(), /MAC Powder Kiss/);
});

test('low rating opens after-sale help; high rating closes and clears the follow-up', () => {
  const custom = data => ({ ...data, demoState: null, orders: [delivered()], decisions: [], saved: [], held: [] });
  const f = homeFixture(null, custom), id = 'followup:delivered:1814412512';
  f.act('open', id); assert.match(f.body(), /aria-label="1 star"/);
  f.act('rate', id, '2');
  assert.equal(f.nodes.get('home-sheet-title').textContent, 'What went wrong?');
  assert.match(f.body(), /\/call\?after-sale=1/);
  const positive = homeFixture(null, custom);
  positive.act('open', id); positive.act('rate', id, '5');
  assert.equal(positive.nodes.get('home-sheet').open, false);
  assert.doesNotMatch(positive.cards(), /home-card followup/);
});

test('section 14 card copy and short names are exact', () => {
  const context = { window: { COUPANG_PRODUCTS: catalog } };
  vm.runInNewContext(readFileSync(new URL('../public/home-demo-data.js', import.meta.url), 'utf8'), context);
  const data = context.window.HOME_DEMO;
  const card = (state, type, when = now) => buildCards(createDemoScenario(data, state, when), when).find(c => c.type === type);
  const copy = c => [c.title, c.line, c.action];
  assert.deepEqual(copy(card('normal', 'arrival')), ['Desk lamp arrives today', 'By 12:00', 'Track order']);
  assert.deepEqual(copy(card('normal', 'decision')), ['Blue-light glasses', '₩19,900 · waiting for your OK', 'Review']);
  assert.deepEqual(copy(card('normal', 'nudge')), ['Lip Monster 03 is back in stock', 'You saved it on Wednesday', 'View']);
  assert.deepEqual(copy(card('problem', 'problem')), ['Your chair is running late', 'Now Friday, not Wednesday. A similar chair can come tomorrow for ₩37,930 more.', 'Get it tomorrow']);
  assert.deepEqual(copy(card('night', 'nudge', new Date(2026, 9, 26, 23))), ['MAC Powder Kiss', "I'll ask you again at 7am · ₩35,700", 'Remove']);
  assert.deepEqual(copy(buildCards({ ...base(), orders: [delivered()] }, now)[0]), ['Your lipstick arrived', "How's the shade?", 'Rate it']);
  assert.match(homeFixture('first').cards(), /Make sure I got them right/);
  assert.match(homeFixture('first').cards(), /href="\/settings">Check/);
  assert.match(homeFixture('quiet').cards(), /Built from things you have/);
});

test('presenter stays hidden by default, opens by query or one-second hold, and stores only the chosen state', () => {
  const f = homeFixture();
  assert.equal(f.document.body.dataset.state, 'normal');
  assert.equal(f.nodes.get('home-presenter').hidden, true);
  const avatar = f.nodes.get('home-avatar');
  avatar.emit('pointerdown', { button: 0, isPrimary: true });
  assert.equal([...f.timers.values()][0].ms, 1000);
  avatar.emit('pointerup');
  assert.equal(f.timers.size, 0); assert.equal(f.nodes.get('home-presenter').hidden, true);
  avatar.emit('pointerdown', { button: 0, isPrimary: true });
  [...f.timers.values()][0].fn();
  assert.equal(f.nodes.get('home-presenter').hidden, false);
  let prevented = false;
  avatar.emit('click', { preventDefault() { prevented = true; } });
  assert(prevented, 'long hold must not navigate to Call');
  f.nodes.get('presenter-problem').emit('click');
  assert.equal(f.session.get('coupi_presenter_state'), 'problem');
  assert.equal(f.document.body.dataset.state, 'problem');
  assert.equal(f.nodes.get('home-brief').textContent, HOME_LINES.problem);
  assert.equal(f.nodes.get('presenter-problem').attributes['aria-pressed'], 'true');
  const reloaded = homeFixture(null, d => d, { session: f.session });
  assert.equal(reloaded.document.body.dataset.state, 'problem');
  assert.equal(reloaded.nodes.get('home-presenter').hidden, true);
  const forced = homeFixture('first', d => d, { session: f.session });
  assert.equal(forced.document.body.dataset.state, 'first', 'call return takes precedence over presenter storage');
  forced.nodes.get('presenter-night').emit('click');
  assert.equal(forced.context.lastURL, '/');
  const opened = homeFixture(null, d => d, { query: '?presenter=1' });
  assert.equal(opened.nodes.get('home-presenter').hidden, false);
  for (const state of PRESENTER_STATES) {
    opened.nodes.get('presenter-' + state).emit('click');
    assert.equal(opened.nodes.get('home-brief').textContent, HOME_LINES[state]);
  }
});

test('Home and sheet copy contain none of the prohibited customer words', () => {
  const forbidden = /\b(demo|sample|reference price|simulated|synthetic|test)\b/i;
  const visibleCopy = html => html.replace(/<[^>]*>/g, '');
  for (const state of Object.keys(HOME_MOODS)) {
    const f = homeFixture(state);
    assert.doesNotMatch(visibleCopy(f.cards()) + f.nodes.get('home-brief').textContent, forbidden);
    for (const match of [...f.cards().matchAll(/data-home-action="open" data-card="([^"]+)"/g)]) {
      f.act('open', match[1]); assert.doesNotMatch(visibleCopy(f.body()), forbidden); f.close();
    }
    f.nodes.get('home-decisions').emit('click'); assert.doesNotMatch(visibleCopy(f.body()), forbidden);
  }
  for (const page of ['main', 'settings']) {
    const html = readFileSync(new URL('../site-pages/' + page + '.html', import.meta.url), 'utf8');
    const copy = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]*>/g, '');
    assert.doesNotMatch(copy, forbidden);
  }
});

function settingsFixture(values = new Map()) {
  const html = readFileSync(new URL('../site-pages/settings.html', import.meta.url), 'utf8');
  class Element {
    constructor() { this.children = []; this.attributes = {}; this.listeners = new Map(); this.textContent = ''; }
    append(...items) { this.children.push(...items); }
    replaceChildren(...items) { this.children = items; }
    setAttribute(key, value) { this.attributes[key] = value; }
    addEventListener(event, fn) { this.listeners.set(event, fn); }
    emit(event) { this.listeners.get(event)?.(); }
    querySelectorAll() { return this.children.flatMap(row => row.children.filter(child => child.textContent === 'Forget')); }
    focus() { this.focused = true; }
    showModal() { this.open = true; }
    close() { this.open = false; this.emit('close'); }
  }
  const nodes = new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(m => [m[1], new Element()]));
  const context = { window: { localStorage: { getItem: k => values.get(k) || null, setItem: (k, v) => values.set(k, v) } }, document: { getElementById: id => nodes.get(id), createElement: () => new Element() }, coupiSVG };
  vm.createContext(context);
  vm.runInContext(readFileSync(new URL('../public/home-demo-data.js', import.meta.url), 'utf8'), context);
  vm.runInContext(readFileSync(new URL('../public/settings.js', import.meta.url), 'utf8').replace(/^import .+;\n/gm, '').replace(/^export /gm, ''), context);
  return { nodes, values, html };
}

test('Settings uses calm COUPI, labelled switches and individual Forget controls that persist', () => {
  const f = settingsFixture();
  assert.match(f.nodes.get('settings-avatar').innerHTML, /COUPI, calm/);
  assert.match(f.html, /You're in charge of what I remember\./);
  assert.equal([...f.html.matchAll(/role="switch"/g)].length, 3);
  assert.match(f.html, /Ask me before buying anything/);
  assert.match(f.html, /Hold late-night buys until morning/);
  assert.match(f.html, /Only use my camera during calls/);
  const root = f.nodes.get('settings-memories');
  assert.equal(root.children.length, 3);
  const forget = root.querySelectorAll()[0];
  assert.equal(forget.textContent, 'Forget'); assert.match(forget.attributes['aria-label'], /Likes soft matte shades/);
  forget.emit('click'); assert.equal(root.children.length, 2);
  const permission = f.nodes.get('hold-late-night'); permission.checked = false; permission.emit('change');
  f.nodes.get('pause-memory').emit('click');
  const reload = settingsFixture(f.values);
  assert.equal(reload.nodes.get('settings-memories').children.length, 2);
  assert.equal(reload.nodes.get('hold-late-night').checked, false);
  assert.equal(reload.nodes.get('pause-memory').attributes['aria-pressed'], 'true');
  reload.nodes.get('forget-everything').emit('click');
  assert.equal(reload.nodes.get('forget-dialog').open, true);
  reload.nodes.get('forget-cancel').emit('click'); assert.equal(JSON.parse(f.values.get('coupi_memory')).length, 2);
  reload.nodes.get('forget-everything').emit('click'); reload.nodes.get('forget-confirm').emit('click');
  const forgotten = settingsFixture(f.values);
  assert.equal(forgotten.nodes.get('settings-memories').children[0].textContent, 'No memories saved.');
  assert.equal(forgotten.nodes.get('hold-late-night').checked, false);
});
