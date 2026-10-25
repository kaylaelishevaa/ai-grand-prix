/* Compare the sourced reference catalog with itself; never invent reviews or join synthetic SKUs. */
(() => {
  'use strict';
  const priced = value => typeof value === 'number' && Number.isFinite(value) && value > 0;
  const money = value => priced(value) ? '₩' + value.toLocaleString('en-US') : 'No reference price';
  const element = (tag, className, text) => { const node = document.createElement(tag); if(className) node.className = className; if(text !== undefined) node.textContent = text; return node; };
  function sourceLink(label, value) {
    let url; try { url = new URL(value); } catch { return null; }
    if (url.protocol !== 'https:') return null;
    const link = element('a', 'reference-source-link', label); link.href = url.href; link.target = '_blank'; link.rel = 'noopener noreferrer'; return link;
  }
  window.CoupiReferenceComparison = {
    render(selected, products, onChoose) {
      const root = document.getElementById('reference-contenders');
      const sources = document.getElementById('reference-sources');
      if (!root || !sources) return;
      root.replaceChildren(); sources.replaceChildren();
      const pool = products.filter(product => product.productType === selected.productType);
      const contenders = pool.filter(product => product.id !== selected.id).slice(0, 2);
      root.append(element('p', 'sheet-kicker', 'SAME PURPOSE · DIFFERENT TRADE-OFFS'), element('h3', '', 'a few ways to get there.'));
      root.append(element('p', 'reference-scope', 'Three sourced listings. Prices are historical references; current options and stock need checking.'));
      const cards = element('div', 'reference-cards');
      for (const item of contenders) {
        const card = element('article', 'reference-card');
        const image = element('img'); image.src = item.image; image.alt = item.name; image.loading = 'lazy';
        image.onerror = () => { image.hidden = true; card.classList.add('image-unavailable'); };
        card.append(image, element('h4', '', item.name), element('strong', 'reference-price', money(item.price)));
        const difference = priced(item.price) && priced(selected.price) ? item.price - selected.price : null;
        card.append(element('span', 'reference-delta', difference === null ? 'price comparison unavailable' : difference === 0 ? 'same reference price' : money(Math.abs(difference)) + (difference < 0 ? ' less · reference' : ' more · reference')));
        const knownPrices = pool.filter(p => priced(p.price));
        if (priced(item.price) && item.price === Math.min(...knownPrices.map(p => p.price))) card.append(element('span', 'reference-badge', (knownPrices.length === pool.length ? 'lowest reference price' : 'lowest of known prices') + (knownPrices.filter(p => p.price === item.price).length > 1 ? ' · tied' : '')));
        const compare = element('button', 'reference-compare', 'Compare ↗'); compare.type = 'button';
        compare.onclick = () => showHead(item);
        card.append(compare); cards.append(card);
      }
      root.append(cards);
      const head = element('section', 'reference-head'); head.hidden = true; head.tabIndex = -1; root.append(head);
      function showHead(other) {
        head.replaceChildren(); head.hidden = false;
        head.append(element('p', 'sheet-kicker', 'SIDE BY SIDE'), element('h4', '', 'what we can actually compare.'));
        const table = element('div', 'reference-table');
        const row = (label, left, right) => { const section = element('section', 'reference-row'); section.append(element('h5', '', label)); const values = element('div', 'reference-values'); values.append(element('p', '', left), element('p', '', right)); section.append(values); table.append(section); };
        row('current pick / contender', selected.name, other.name);
        row('reference price', money(selected.price), money(other.price));
        row('source-listed attributes', (selected.verifiedAttributes || []).join(' · ') || 'No further attributes supplied.', (other.verifiedAttributes || []).join(' · ') || 'No further attributes supplied.');
        row('reviews', 'Not supplied for this listing.', 'Not supplied for this listing.');
        row('delivery', 'Current delivery window unknown.', 'Current delivery window unknown.');
        row('durability', 'No tested-use evidence supplied.', 'No tested-use evidence supplied.');
        head.append(table);
        const links = element('div', 'reference-links');
        for (const [label, item] of [['Current pick on Coupang', selected], ['Contender on Coupang', other]]) { const link = sourceLink(label + ' ↗', item.url); if(link) links.append(link); }
        head.append(links);
        const choose = element('button', 'reference-choose', 'Make this my pick'); choose.type = 'button'; choose.onclick = () => onChoose(other); head.append(choose);
        head.append(element('p', 'sheet-note', 'Updates this call’s pick. It does not order anything or invent a taste preference.'));
        head.focus({preventScroll:true}); head.scrollIntoView({block:'nearest', behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
      }
      const disclosure = element('details', 'reference-provenance');
      disclosure.append(element('summary', '', 'See the original sources'));
      disclosure.append(element('p', '', selected.sourceNote || 'Sourced listing reference; current merchant facts must be checked.'));
      if (selected.checkedAt) disclosure.append(element('p', 'reference-date', 'Source record checked ' + selected.checkedAt));
      for (const [label, url] of [['Coupang listing ↗',selected.url], ['Indexed source page ↗',selected.imageSourcePage], ['Original product photo ↗',selected.sourceImageUrl]]) { const link=sourceLink(label,url); if(link) disclosure.append(link); }
      sources.append(disclosure);
    },
  };
})();
