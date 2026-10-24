/* Orders and decisions are synthetic. Product facts come from the existing catalog. */
window.HOME_DEMO = {
  catalog: window.COUPANG_PRODUCTS || [],
  user: { name: 'Mina' },
  now: '2026-10-26T08:10:00',
  orders: [
    { id: '1042', items: ['1814412512'], status: 'delivered', deliveredAt: '2026-10-25T07:02' },
    { id: '1043', items: ['55518713'], status: 'out_for_delivery', eta: '2026-10-26T12:00' },
    { id: '1044', items: ['20145368'], status: 'delayed', eta: '2026-10-30', originalEta: '2026-10-28',
      swap: { item: '7950092256', eta: '2026-10-27', priceDelta: 7530 } }
  ],
  decisions: [{ item: '7612276799', status: 'waiting', addedAt: '2026-10-25T21:10' }],
  held: [{ item: '7322824636', addedAt: '2026-10-25T23:10', heldUntil: '2026-10-27T07:00' }],
  saved: [{ item: '7185725748', event: 'back_in_stock', savedAt: '2026-10-21' }],
  memory: [
    { text: 'Likes soft matte shades', source: 'your first call' },
    { text: 'Works at a desk most days', source: 'your first call' },
    { text: 'Budget around ₩30,000 for small things', source: 'you told me' }
  ],
  demoState: 'normal'
};
