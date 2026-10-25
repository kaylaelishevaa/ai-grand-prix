import { coupiSVG } from './coupi.js';

const HOUR = 3600000;
const DAY = 24 * HOUR;
const priorities = { problem: 0, decision: 1, arrival: 2, followup: 3, nudge: 4 };
export const HOME_MOODS = { first: 'excited', normal: 'calm', problem: 'attentive', quiet: 'relaxed', night: 'sleepy', loading: 'idle', offline: 'calm' };
export const HOME_LINES = {
  normal: 'Morning, Mina. Your desk lamp arrives today, and your glasses need your OK.',
  problem: 'Your chair is running late, Mina. I found one that can come tomorrow.',
  first: 'That was fun, Mina! Your lipstick arrives tomorrow morning.',
  quiet: 'Nothing needs you today, Mina. Enjoy it.',
  night: "It's late, Mina. I'll hold the lipstick until morning."
};
export const PRESENTER_STATES = ['normal', 'problem', 'first', 'night'];
export const money = value => '₩' + Number(value).toLocaleString('en-US');
const date = value => new Date(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value + 'T00:00:00' : value);
const time = value => value ? date(value).getTime() : NaN;
const dayStart = value => { const d = date(value); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };
const nextDay = value => { const d = date(value); return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime(); };
const weekday = value => date(value).toLocaleDateString('en-US', { weekday: 'long' });
const clock = value => date(value).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
const shortNames = { '1814412512': 'Romand Zero Matte 09', '55518713': 'Desk lamp', '7612276799': 'Blue-light glasses', '6566125679': 'Office chair', '7185725748': 'Lip Monster 03', '7322824636': 'MAC Powder Kiss', '7330605115': 'Study chair' };
const displayName = product => shortNames[product.id] || product.aliases?.[0] || product.name;
const noun = product => ({ lamp: 'lamp', chair: 'chair', glasses: 'glasses', lipstick: 'lipstick', tshirt: 'T-shirt', hoodie: 'hoodie' })[product.productType] || 'item';
const catalogMap = data => new Map((Array.isArray(data.catalog) ? data.catalog : Object.values(data.catalog || {})).map(p => [String(p.id), p]));
const ownedIds = data => new Set([...(data.owned || []).map(String), ...(data.orders || []).filter(o => o.status === 'delivered').flatMap(o => o.items.map(String))]);
const activeDecision = (d, now) => d.status === 'waiting' || (!['approved', 'removed', 'expired'].includes(d.status) && time(d.expiresAt) >= now && time(d.expiresAt) <= now + DAY);
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function arrivalWhen(eta, now) {
  const day = dayStart(eta);
  const label = day === dayStart(now) ? 'today' : day === nextDay(now) ? 'tomorrow' : weekday(eta);
  return label + (String(eta).includes('T') ? ' by ' + clock(eta) : '');
}

/** Pure rules engine. Data must carry its catalog; no browser globals or wall clock reads. */
export function buildCards(data, now) {
  const current = date(now).getTime();
  if (!Number.isFinite(current)) throw new TypeError('buildCards requires a valid now');
  const products = catalogMap(data), owned = ownedIds(data), candidates = [];
  const add = (type, item, source, facts) => {
    const product = products.get(String(item));
    if (!product) return;
    candidates.push({ id: `${type}:${source.id || item}:${item}`, type, product, source, title: displayName(product), ...facts });
  };
  for (const order of data.orders || []) {
    if (['cancelled', 'returned'].includes(order.status)) continue;
    const eta = time(order.eta);
    // A date-only ETA is late after that local calendar day, not at its start.
    const lateAt = /^\d{4}-\d{2}-\d{2}$/.test(order.eta || '') ? nextDay(order.eta) : eta;
    const late = order.status !== 'delivered' && (order.status === 'delayed' || lateAt < current);
    const pickup = order.status === 'pickup_due' || (order.pickupAt && dayStart(order.pickupAt) <= dayStart(now) && !order.pickedUpAt);
    const input = ['return_needs_input', 'exchange_needs_input'].includes(order.status) || (['return', 'exchange'].includes(order.status) && order.needsInput);
    for (const item of order.items || []) {
      const product = products.get(String(item));
      if (!product) continue;
      if (late || pickup || input) {
        const swap = order.swap && products.get(String(order.swap.item));
        let line = pickup ? 'Pickup due' : input ? 'Your ' + order.status.split('_')[0] + ' needs input' : Number.isFinite(eta) ? 'Now ' + weekday(order.eta) + (order.originalEta ? ', not ' + weekday(order.originalEta) : '') : 'Delivery is late';
        if (swap && late) line += '. A similar ' + noun(product) + ' can come ' + arrivalWhen(order.swap.eta, now) + ' for ' + money(order.swap.priceDelta) + ' more.';
        add('problem', item, order, { title: late ? `Your ${noun(product)} is running late` : displayName(product), line, action: swap && late ? 'Get it tomorrow' : 'Fix', urgency: time(order.pickupAt || order.inputDueAt || order.originalEta || order.eta) || current,
          brief: `Your ${noun(product)} ${pickup ? 'pickup is due' : input ? 'needs your input' : 'is delayed'}`, problem: pickup ? 'pickup' : input ? 'input' : 'late', swap: swap && late ? swap : null });
      } else if (order.status !== 'delivered' && dayStart(order.eta) >= dayStart(now) && dayStart(order.eta) <= nextDay(now)) {
        add('arrival', item, order, { title: `${displayName(product)} ${product.productType === 'glasses' ? 'arrive' : 'arrives'} ${arrivalWhen(order.eta, now).split(' by ')[0]}`, line: String(order.eta).includes('T') ? 'By ' + clock(order.eta) : 'On its way', action: 'Track order', urgency: eta, brief: `Your ${noun(product)} ${product.productType === 'glasses' ? 'arrive' : 'arrives'} ${arrivalWhen(order.eta, now)}` });
      } else if (order.status === 'delivered' && time(order.deliveredAt) <= current && time(order.deliveredAt) >= current - 3 * DAY && !order.rated) {
        add('followup', item, order, { title: `Your ${noun(product)} arrived`, line: product.productType === 'lipstick' ? "How's the shade?" : 'How is it?', action: 'Rate it', urgency: time(order.deliveredAt) + 3 * DAY, brief: `Your ${noun(product)} arrived` });
      }
    }
  }
  for (const decision of data.decisions || []) {
    if (!activeDecision(decision, current)) continue;
    const product = products.get(String(decision.item));
    if (!product) continue;
    const expiring = time(decision.expiresAt) >= current && time(decision.expiresAt) <= current + DAY;
    add('decision', decision.item, decision, { line: money(product.price) + (expiring ? ' · quote expires ' + clock(decision.expiresAt) : ' · waiting for your OK'), action: 'Review',
      urgency: expiring ? time(decision.expiresAt) : Infinity,
      brief: `Your ${noun(product)} ${expiring ? 'quote expires at ' + clock(decision.expiresAt) : 'need' + (product.productType === 'glasses' ? '' : 's') + ' your OK'}` });
  }
  const problems = candidates.some(c => c.type === 'problem');
  // Evidence-backed nudges are only considered after all higher priorities.
  if (!problems) {
    for (const held of data.held || []) {
      if (owned.has(String(held.item)) || held.status === 'removed' || held.kept || !Number.isFinite(time(held.heldUntil)) || time(held.addedAt) > current) continue;
      const product = products.get(String(held.item));
      if (!product) continue;
      const pending = time(held.heldUntil) > current;
      add('nudge', held.item, held, { kind: 'held', line: (pending ? "I'll ask you again at " + date(held.heldUntil).toLocaleTimeString('en-US', { hour: 'numeric', hour12: true }).replace(/\s/g, '').toLowerCase() : 'Held overnight') + ' · ' + money(product.price), action: 'Remove', urgency: time(held.heldUntil),
        reason: 'Held overnight' + (held.addedAt ? ' after you added it on ' + weekday(held.addedAt) : '') + (pending ? '; held until ' + clock(held.heldUntil) + '.' : '.'),
        brief: `Your ${noun(product)} ${pending ? 'is held until ' + clock(held.heldUntil) : 'was held overnight'}` });
    }
    for (const saved of data.saved || []) {
      if (owned.has(String(saved.item)) || !Number.isFinite(time(saved.savedAt)) || time(saved.savedAt) > current || !['back_in_stock', 'price_dropped'].includes(saved.event)) continue;
      if (saved.eventAt && time(saved.eventAt) > current) continue;
      const product = products.get(String(saved.item));
      if (!product) continue;
      add('nudge', saved.item, saved, { kind: saved.event, title: displayName(product) + (saved.event === 'back_in_stock' ? ' is back in stock' : ''), line: saved.event === 'back_in_stock' ? 'You saved it on ' + weekday(saved.savedAt) : money(product.price) + ' · price dropped', action: 'View',
        urgency: current + DAY + (current - (time(saved.eventAt) || time(saved.savedAt))), reason: 'You saved it on ' + weekday(saved.savedAt) + '.',
        brief: saved.event === 'back_in_stock' ? `Your saved ${noun(product)} is back in stock` : `Your saved ${noun(product)} is now ${money(product.price)}` });
    }
  }
  candidates.sort((a, b) => priorities[a.type] - priorities[b.type] || a.urgency - b.urgency || (time(a.source.addedAt) || 0) - (time(b.source.addedAt) || 0) || a.id.localeCompare(b.id));
  let nudgeShown = false;
  return candidates.filter(card => card.type !== 'nudge' || (!nudgeShown && (nudgeShown = true))).slice(0, problems ? 2 : 3);
}

/** URL/demo overrides win; real problems still control card suppression and limits. */
export function deriveState(data, now, override) {
  if (Object.hasOwn(HOME_MOODS, override)) return override;
  if (Object.hasOwn(HOME_MOODS, data.demoState)) return data.demoState;
  const cards = buildCards(data, now);
  if (cards.some(c => c.type === 'problem')) return 'problem';
  const hour = date(now).getHours();
  if (hour >= 22 || hour < 7) return 'night';
  return cards.length ? 'normal' : 'quiet';
}

/** Template only. No model, memory, camera, or unselected data can supply brief facts. */
export function buildBrief(cards, state, name) {
  const updates = cards.filter(c => !['world', 'memory'].includes(c.type));
  // Use the agreed lines while their facts are present; choices must not leave a stale brief.
  if (['normal', 'offline'].includes(state) && updates.some(c => c.type === 'arrival' && c.product?.id === '55518713') && updates.some(c => c.type === 'decision' && c.product?.id === '7612276799')) return HOME_LINES.normal;
  if (state === 'problem' && updates.some(c => c.type === 'problem' && c.swap)) return HOME_LINES.problem;
  if (state === 'first' && updates.some(c => c.type === 'arrival')) return HOME_LINES.first;
  if (state === 'night' && updates.some(c => c.kind === 'held')) return HOME_LINES.night;
  if (!updates.length) {
    const memory = cards.find(c => c.type === 'memory');
    return memory ? `Hi, ${String(name || 'there').trim().split(/\s+/)[0]}. ${memory.brief}.`.split(/\s+/).slice(0, 20).join(' ') : HOME_LINES.quiet;
  }
  const greeting = `${state === 'night' ? 'Evening' : 'Hi'}, ${String(name || 'there').trim().split(/\s+/)[0]}.`;
  const held = state === 'night' && updates.find(c => c.kind === 'held');
  const rest = held && held !== updates[0] ? `. ${held.brief}.` : updates.length > 1 ? `. ${updates.length - 1} other ${updates.length === 2 ? 'update' : 'updates'}.` : '.';
  const budget = 20 - (greeting + rest).trim().split(/\s+/).length;
  const fact = String(updates[0].brief || updates[0].title).replace(/[.!?]+$/, '').split(/\s+/).slice(0, Math.max(1, budget)).join(' ');
  return `${greeting} ${fact}${rest}`;
}

// FUTURE SERVER ROUTE HOOK: send only selected structured card facts to a server
// brief route, validate <=20 words, and cache by local date + card set. Until that
// route exists, buildBrief is the complete offline/online path. No browser model API.

/** Synthetic stage scenarios are separate from the rules engine and never mutate input. */
export function createDemoScenario(input, state, now) {
  const data = JSON.parse(JSON.stringify(input));
  const stamp = (offset, hour = 7) => {
    const d = date(now); d.setDate(d.getDate() + offset); d.setHours(hour, 0, 0, 0); return d.toISOString();
  };
  if (state === 'first') {
    data.orders = [{ id: 'first-order', items: ['1814412512'], status: 'packed', eta: stamp(1) }];
    data.decisions = []; data.held = []; data.saved = [];
  } else if (state === 'normal' || state === 'offline' || state === 'loading') {
    data.orders = data.orders.filter(o => o.status === 'out_for_delivery');
    data.held = [];
  } else if (state === 'quiet') {
    data.orders = [{ id: 'owned-desk', items: ['55518713', '6566125679'], status: 'delivered', deliveredAt: stamp(-10) }];
    data.decisions = []; data.held = []; data.saved = [];
  } else if (state === 'night') {
    data.orders = [{ id: 'night-order', items: ['7612276799'], status: 'packed', eta: stamp(1) }];
    data.decisions = []; data.saved = [];
    data.held = data.held.map(item => ({ ...item, heldUntil: stamp(1), addedAt: stamp(0, 22) }));
  }
  return data;
}

function viewCards(data, now, state) {
  const cards = buildCards(data, now);
  if (state === 'first' && !cards.some(c => c.type === 'problem') && data.memory?.length && cards.length < 3) {
    cards.push({ id: 'memory', type: 'memory', title: `I learned ${data.memory.length} things about you`, line: 'Make sure I got them right', action: 'Check', brief: `${data.memory.length} memories are ready to review` });
  }
  if (!cards.length && state !== 'first') {
    const products = catalogMap(data), owned = [...ownedIds(data)].map(id => products.get(id)).filter(Boolean).slice(0, 2);
    cards.push({ id: 'world', type: 'world', title: owned.length ? 'A little world of your own' : 'Your worlds', line: owned.length ? 'Built from things you have' : 'A place to explore', products: owned, action: 'Explore' });
  }
  return cards;
}

function initHome() {
  const $ = id => document.getElementById(id);
  const input = window.HOME_DEMO || { catalog: [], user: {} };
  const query = new URLSearchParams(location.search);
  const requested = query.get('state');
  let selected;
  try { selected = sessionStorage.getItem('coupi_presenter_state'); } catch { /* Optional storage. */ }
  let override = Object.hasOwn(HOME_MOODS, requested) ? requested : PRESENTER_STATES.includes(selected) ? selected : input.demoState;
  let now, data;
  function resetScenario() {
    now = date(input.now || new Date());
    if (override === 'night') now.setHours(23, 0, 0, 0);
    data = createDemoScenario(input, override, now);
    try {
      const stored = JSON.parse(localStorage.getItem('coupi_memory'));
      if (Array.isArray(stored)) data.memory = stored;
    } catch { /* Storage is optional; the page still works without it. */ }
  }
  resetScenario();
  let cards = [], state, toastTimer, sheetOpener;
  const sheet = $('home-sheet');
  const image = product => `<img class="home-product-image" src="${escapeHTML(product.image)}" alt="${escapeHTML(displayName(product))}">`;
  const button = (label, action, id, secondary = false) => `<button class="home-action${secondary ? ' secondary' : ''}" data-home-action="${action}" data-card="${escapeHTML(id)}">${escapeHTML(label)}</button>`;
  function renderCard(card) {
    const copy = `<div class="home-card-copy"><h2>${escapeHTML(card.title)}</h2><p>${escapeHTML(card.line)}</p></div>`;
    if (card.type === 'world') return `<article class="home-card world"><div class="home-world-images">${card.products.map(image).join('')}</div><div class="home-card-row">${copy}<a class="home-action" href="/explore">Explore</a></div></article>`;
    if (card.type === 'memory') return `<article class="home-card memory">${copy}<a class="home-action secondary" href="/settings">Check</a></article>`;
    if (card.type === 'problem') return `<article class="home-card problem"><div class="home-card-row">${image(card.product)}${copy}</div><div class="home-actions">${button(card.action, 'open', card.id)}${card.swap ? button('Wait for ' + weekday(card.source.eta), 'wait', card.id, true) : ''}</div></article>`;
    return `<article class="home-card ${card.type}">${image(card.product)}${copy}${button(card.action, card.kind === 'held' ? 'remove-held' : 'open', card.kind === 'held' ? card.product.id : card.id, card.type === 'nudge')}</article>`;
  }
  function render() {
    state = deriveState(data, now, override);
    document.body.dataset.state = state;
    document.querySelector('meta[name="theme-color"]').content = state === 'night' ? '#173e45' : '#edf8fa';
    $('home-avatar').innerHTML = coupiSVG(HOME_MOODS[state], 150);
    cards = viewCards(data, now, state);
    $('home-brief').textContent = buildBrief(cards, state, data.user?.name);
    $('home-cards').innerHTML = cards.map(renderCard).join('');
    if (state === 'loading') {
      $('home-brief').innerHTML = '<span class="home-sr-only">Getting your day ready</span><span class="home-dots" aria-hidden="true"><i></i><i></i><i></i></span>';
      $('home-cards').innerHTML = '<div class="home-loading"></div><div class="home-loading"></div>';
    }
    $('home-cards').setAttribute('aria-busy', String(state === 'loading'));
    const count = (data.decisions || []).filter(d => activeDecision(d, now.getTime())).length + (data.held || []).filter(h => h.status !== 'removed').length;
    $('home-count').textContent = count; $('home-count').hidden = !count;
    $('home-decisions').setAttribute('aria-label', `Decisions, ${count} waiting or held`);
    for (const choice of PRESENTER_STATES) $('presenter-' + choice).setAttribute('aria-pressed', String(state === choice));
  }
  function announce(message) { clearTimeout(toastTimer); $('home-status').textContent = message; toastTimer = setTimeout(() => { $('home-status').textContent = ''; }, 4000); }
  function openSheet(title, content) {
    if (!sheet.open) sheetOpener = document.activeElement;
    $('home-sheet-title').textContent = title; $('home-sheet-body').innerHTML = content;
    if (!sheet.open) sheet.showModal();
    $('home-sheet-close').focus();
  }
  function productBody(product) {
    return `<img class="home-sheet-product" src="${escapeHTML(product.image)}" alt="${escapeHTML(displayName(product))}"><h3>${escapeHTML(displayName(product))}</h3><p><strong>${money(product.price)}</strong></p>`;
  }
  function decisionsSheet() {
    const products = catalogMap(data);
    const decisions = (data.decisions || []).filter(d => activeDecision(d, now.getTime()) && products.has(String(d.item)));
    const held = (data.held || []).filter(h => h.status !== 'removed' && products.has(String(h.item)));
    openSheet('Decisions', decisions.map(d => `<section class="home-sheet-item">${productBody(products.get(String(d.item)))}<div class="home-actions">${button('Buy for ' + money(products.get(String(d.item)).price), 'approve', d.item)}${button('Not now', 'remove-decision', d.item, true)}</div></section>`).join('') + held.map(h => `<section class="home-sheet-item">${productBody(products.get(String(h.item)))}<p>${time(h.heldUntil) > now ? 'Held until ' + clock(h.heldUntil) : 'Held overnight'}</p><div class="home-actions">${button('Remove', 'remove-held', h.item, true)}</div></section>`).join('') || '<p>Nothing is waiting for your approval.</p>');
  }
  function problemSheet(card, options) {
    const order = card.source;
    let content = productBody(card.product) + `<p>${escapeHTML(card.line)}</p>`;
    if (card.swap && !options) {
      content += `<h3>Ready to swap</h3>${productBody(card.swap)}<p>Arrives ${escapeHTML(arrivalWhen(order.swap.eta, now))} · +${money(order.swap.priceDelta)}</p><div class="home-actions">${button('Get it tomorrow', 'swap', card.id)}${button('Wait for ' + weekday(order.eta), 'wait', card.id, true)}</div>`;
    } else if (card.problem === 'late') {
      content += `<div class="home-actions">${button('Wait' + (order.eta ? ' for ' + weekday(order.eta) : ''), 'wait', card.id)}${button('Cancel this item', 'cancel-item', card.id, true)}</div>`;
    } else {
      content += '<p>Any refund is after pickup.</p><div class="home-actions">' + button(card.problem === 'pickup' ? 'Confirm pickup' : 'Arrange a return', 'return', card.id) + button('Talk through options', 'after-sale', card.id, true) + '</div>';
    }
    openSheet('Let’s sort this out', content);
  }
  function openCard(card, options = false) {
    if (card.type === 'decision') {
      openSheet('Your decision', productBody(card.product) + `<p>${escapeHTML(card.line)}</p><div class="home-actions">${button('Buy for ' + money(card.product.price), 'approve', card.product.id)}${button('Not now', 'remove-decision', card.product.id, true)}</div>`);
    } else if (card.type === 'problem') problemSheet(card, options);
    else if (card.type === 'arrival') {
      const stages = ['Ordered', 'Packed', 'Out for delivery', 'Delivered'];
      const step = ({ ordered: 0, packed: 1, shipped: 1, out_for_delivery: 2, delivered: 3 })[card.source.status] ?? 0;
      openSheet('Your delivery', productBody(card.product) + `<p>Order ${escapeHTML(card.source.id)} · ${escapeHTML(card.line)}</p><ol class="home-timeline">${stages.map((stage, i) => `<li class="${i <= step ? 'complete' : ''}"${i === step ? ' aria-current="step"' : ''}>${stage}${i > step ? ' · upcoming' : ''}</li>`).join('')}</ol>`);
    } else if (card.type === 'followup') {
      openSheet('How is it?', productBody(card.product) + `<div class="home-rating" role="group" aria-label="Rate your purchase">${[1, 2, 3, 4, 5].map(n => `<button data-home-action="rate" data-card="${escapeHTML(card.id)}" data-rating="${n}" aria-label="${n} ${n === 1 ? 'star' : 'stars'}">${n} ★</button>`).join('')}</div>`);
    } else if (card.type === 'nudge') {
      openSheet('A closer look', productBody(card.product) + `<p>${escapeHTML(card.line)}</p><p><strong>Why this is here</strong><br>${escapeHTML(card.reason)}</p><div class="home-actions">${card.kind === 'held' ? button('Remove', 'remove-held', card.product.id, true) : button('Add to Decisions', 'add-decision', card.id)}</div>`);
    }
  }
  function finish(message) { sheet.close(); render(); announce(message); }
  function act(event) {
    const target = event.target.closest('[data-home-action]'); if (!target) return;
    const action = target.dataset.homeAction, id = target.dataset.card, card = cards.find(c => c.id === id);
    if (action === 'open' || action === 'options') { if (card) openCard(card, action === 'options'); return; }
    if (action === 'approve' || action === 'remove-decision') {
      const decision = data.decisions.find(d => String(d.item) === id && activeDecision(d, now.getTime()));
      if (decision) decision.status = action === 'approve' ? 'approved' : 'removed';
      finish(action === 'approve' ? 'Your choice is saved. No order has been placed.' : 'Decision removed.');
    } else if (action === 'keep' || action === 'remove-held') {
      const held = data.held.find(h => String(h.item) === id); if (!held) return;
      if (action === 'remove-held') held.status = 'removed';
      else if (time(held.heldUntil) > now.getTime()) held.kept = true;
      else { held.status = 'removed'; data.decisions.push({ item: id, status: 'waiting', addedAt: now.toISOString() }); }
      finish(action === 'keep' ? 'Kept for review. Nothing purchased.' : 'Held item removed.');
    } else if (action === 'add-decision' && card) {
      if (!data.decisions.some(d => String(d.item) === String(card.product.id) && d.status === 'waiting')) data.decisions.push({ item: card.product.id, status: 'waiting', addedAt: now.toISOString() });
      data.saved = data.saved.filter(s => String(s.item) !== String(card.product.id));
      finish('Added to Decisions for your review.');
    } else if (card && ['swap', 'wait', 'cancel-item', 'return'].includes(action)) {
      const order = card.source;
      if (action === 'swap') {
        const index = order.items.indexOf(card.product.id); if (index !== -1) order.items[index] = order.swap.item;
        order.eta = order.swap.eta; order.status = 'packed'; delete order.swap;
      } else if (action === 'wait') { order.status = 'packed'; }
      else if (action === 'cancel-item') { order.items = order.items.filter(item => item !== card.product.id); if (!order.items.length) order.status = 'cancelled'; }
      else { order.status = 'return_arranged'; order.needsInput = false; delete order.pickupAt; delete order.eta; }
      finish(action === 'return' ? 'Pickup requested. Refund after pickup.' : 'Your choice is saved.');
    } else if (action === 'rate' && card) {
      const rating = Number(target.dataset.rating); card.source.rated = rating;
      if (rating <= 2) openSheet('What went wrong?', '<p>Talk it through with COUPI to find an after-sale option.</p><a class="home-action" href="/call?after-sale=1">Start an after-sale call</a>');
      else finish('Thanks. Your rating is saved.');
    } else if (action === 'after-sale') location.href = '/call?after-sale=1';
  }
  $('home-cards').addEventListener('click', act); $('home-sheet-body').addEventListener('click', act);
  $('home-decisions').addEventListener('click', decisionsSheet);
  $('home-sheet-close').addEventListener('click', () => sheet.close());
  sheet.addEventListener('click', event => { if (event.target === sheet) { const r = sheet.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) sheet.close(); } });
  sheet.addEventListener('close', () => { render(); if (sheetOpener?.isConnected) sheetOpener.focus(); else $('home-decisions').focus(); });
  let pressTimer, longPressed = false;
  function openPresenter() { $('home-presenter').hidden = false; }
  if (query.get('presenter') === '1') openPresenter();
  for (const choice of PRESENTER_STATES) $('presenter-' + choice).addEventListener('click', () => {
    override = choice;
    try { sessionStorage.setItem('coupi_presenter_state', choice); } catch { /* Optional storage. */ }
    query.delete('state');
    history.replaceState(null, '', location.pathname + (query.size ? '?' + query : ''));
    resetScenario(); render();
  });
  $('home-avatar').addEventListener('pointerdown', event => {
    if (event.button !== 0 || event.isPrimary === false) return;
    clearTimeout(pressTimer); longPressed = false;
    pressTimer = setTimeout(() => { longPressed = true; openPresenter(); }, 1000);
  });
  for (const event of ['pointerup', 'pointerleave', 'pointercancel']) $('home-avatar').addEventListener(event, () => clearTimeout(pressTimer));
  $('home-avatar').addEventListener('click', event => { if (longPressed) event.preventDefault(); });
  $('home-avatar').addEventListener('contextmenu', event => event.preventDefault());
  window.addEventListener('pageshow', () => {
    try { const stored = JSON.parse(localStorage.getItem('coupi_memory')); if (Array.isArray(stored)) data.memory = stored; } catch { /* Optional storage. */ }
    render();
  });
  render();
}

if (typeof document !== 'undefined' && document.getElementById('coupi-home')) initHome();
