import type { SKU } from './types';

/** Functional substitutes, not merchandising categories. A brush is never lipstick. */
export const originalComparisonGroups: Record<string, string> = {
  kettle: 'kettle', kettleAlt: 'kettle',
  cooker: 'rice-cooker', bigCooker: 'rice-cooker',
  mugs: 'drinkware', glass: 'drinkware',
  apron: 'apron', cottonApron: 'apron',
  tray: 'tray', bambooTray: 'tray',
  speaker: 'portable-speaker', miniSpeaker: 'portable-speaker',
  socks: 'sports-socks', socksBudget: 'sports-socks', socksRunner: 'sports-socks', socksFragrance: 'sports-socks',
  organizer: 'desktop-organizer', matcha: 'matcha-set', espresso: 'stovetop-coffee',
  lamp: 'table-light', smallLamp: 'table-light', rattan: 'table-light',
  vase: 'vase', smallVase: 'vase', candle: 'scented-candle', smallCandle: 'scented-candle',
  cushion: 'filled-cushion', cushionCover: 'cushion-cover',
  milk: 'oat-milk', greens: 'spinach', mushrooms: 'enoki', tomato: 'cherry-tomatoes', tofu: 'soft-tofu',
  dateDress: 'midi-dress', eveningBlouse: 'blouse', littleHandbag: 'shoulder-bag',
  roseLipstick: 'lipstick', softCompact: 'pressed-powder', eveningPerfume: 'perfume',
  smallHoops: 'hoop-earrings', blendingBrush: 'powder-brush',
};

const knownGroups = new Set(Object.values(originalComparisonGroups));

export function comparisonGroupForSku(sku: SKU): string {
  if (originalComparisonGroups[sku.id]) return originalComparisonGroups[sku.id];
  const group = sku.facts.comparisonGroup;
  if (typeof group === 'string' && knownGroups.has(group)) return group;
  // An unknown type is not evidence that two products do the same job.
  return `unmatched:${sku.id}`;
}

export function samePurpose(a: SKU, b: SKU): boolean {
  if (a.sensitive || b.sensitive || a.ownedByDefault || b.ownedByDefault) return false;
  return comparisonGroupForSku(a) === comparisonGroupForSku(b);
}
