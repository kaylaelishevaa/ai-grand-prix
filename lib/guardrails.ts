import { getSku } from './catalog';
import type { Decision, OwnedItem, Profile } from './types';

export function validatedTimezone(timezone: string): string {
  try { new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date(0)); return timezone; }
  catch { return 'Asia/Seoul'; }
}
interface WallClock { year: number; month: number; day: number; hour: number; minute: number; second: number; }
export function localClock(now: Date, timezone: string): WallClock {
  const values = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: validatedTimezone(timezone), year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(now).filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]));
  return values as unknown as WallClock;
}
function wallStamp(parts: WallClock): number {
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
}
/** Iteratively resolve a wall-clock time so the next morning respects the IANA zone and DST change. */
export function fromLocalClock(parts: WallClock, timezone: string): Date {
  const desired = wallStamp(parts);
  let instant = desired;
  for (let attempt = 0; attempt < 5; attempt++) {
    const delta = desired - wallStamp(localClock(new Date(instant), timezone));
    if (!delta) break;
    instant += delta;
  }
  return new Date(instant);
}
export function effectiveNow(profile: Profile, now: Date = new Date()): Date {
  if (!profile.pretend2am) return new Date(now);
  const wall = localClock(now, profile.timezone);
  return fromLocalClock({ ...wall, hour: 2, minute: 14, second: 0 }, profile.timezone);
}
export function lockUntilMorning(profile: Profile, now: Date = new Date()): string | null {
  const effective = effectiveNow(profile, now), wall = localClock(effective, profile.timezone);
  if (wall.hour >= 7 && wall.hour < 22) return null;
  if (wall.hour >= 22) {
    const tomorrow = new Date(Date.UTC(wall.year, wall.month - 1, wall.day + 1));
    wall.year = tomorrow.getUTCFullYear(); wall.month = tomorrow.getUTCMonth() + 1; wall.day = tomorrow.getUTCDate();
  }
  return fromLocalClock({ ...wall, hour: 7, minute: 0, second: 0 }, profile.timezone).toISOString();
}
export function isDecisionLocked(profile: Profile, decision: Decision, now: Date = new Date()): boolean {
  return Boolean(decision.lockedUntil && effectiveNow(profile, now).getTime() < Date.parse(decision.lockedUntil));
}
export function ownsSku(profile: Profile, skuId: string): OwnedItem | undefined {
  return profile.owned.find((item) => item.skuId === skuId);
}
export function ownedMessage(profile: Profile, skuId: string, now: Date = new Date()): string {
  const owned = ownsSku(profile, skuId);
  if (!owned) return '';
  if (owned.source === 'have-one') return 'You told me you already have this. You don’t need another.';
  if (owned.source === 'approved') return 'You already approved this. You don’t need another.';
  const ageDays = Math.max(0, Math.floor((now.getTime() - Date.parse(owned.acquiredAt)) / 86400000));
  const weeks = Math.floor(ageDays / 7);
  return `You bought this ${weeks >= 1 ? `${weeks} week${weeks === 1 ? '' : 's'}` : `${ageDays} day${ageDays === 1 ? '' : 's'}`} ago. You don’t need it.`;
}
function normalized(value: string) { return value.normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim(); }
function mentions(haystack: string, needle: string): boolean {
  if (!needle) return false;
  // English aliases match complete words; Hangul and Han aliases also work inside inflected text.
  return /[^\x00-\x7F]/.test(needle) ? haystack.includes(needle) : (` ${haystack} `).includes(` ${needle} `);
}
/** Run before generating any model request. Specific SKU identifiers and owned aliases are both checked. */
export function detectOwnedRequest(profile: Profile, question: string, pickSkuId?: string): OwnedItem | undefined {
  if (pickSkuId) { const explicit = ownsSku(profile, pickSkuId); if (explicit) return explicit; }
  const query = normalized(question);
  return profile.owned.find((owned) => {
    const sku = getSku(owned.skuId);
    return sku && [sku.id, sku.name, ...sku.aliases].map(normalized).some((alias) => mentions(query, alias));
  });
}
function touched(profile: Profile, now: Date): Profile { profile.revision += 1; profile.updatedAt = now.toISOString(); return profile; }

export function addDecision(profile: Profile, skuId: string, source: string, now: Date = new Date()): { profile: Profile; blocked?: string; decision?: Decision } {
  const sku = getSku(skuId);
  if (!sku) return { profile, blocked: 'That item isn’t in the catalog.' };
  if (ownsSku(profile, skuId)) return { profile, blocked: ownedMessage(profile, skuId, now) };
  if (sku.sensitive || profile.quarantine.some((item) => item.sensitive && item.category === sku.category)) {
    return { profile, blocked: 'This category is quarantined and cannot be added by COUPI.' };
  }
  const duplicate = profile.decisions.find((decision) => decision.skuId === skuId && !decision.approvedAt);
  if (duplicate) return { profile, decision: duplicate };
  const next: Profile = structuredClone(profile);
  const effective = effectiveNow(profile, now);
  const decision: Decision = {
    id: `decision-${skuId}-${now.getTime()}-${next.decisions.length}`,
    skuId, source: source.trim().slice(0, 100) || 'your choice', addedAt: effective.toISOString(),
    lockedUntil: lockUntilMorning(profile, now), approvedAt: null,
  };
  next.decisions.push(decision);
  return { profile: touched(next, now), decision };
}

export function approveDecisions(profile: Profile, ids: string[], now: Date = new Date()): { profile: Profile; approved: string[]; blocked: string[] } {
  const next: Profile = structuredClone(profile), approved: string[] = [], blocked: string[] = [];
  for (const id of new Set(ids)) {
    const decision = next.decisions.find((item) => item.id === id);
    if (!decision) { blocked.push('Unknown decision.'); continue; }
    if (decision.approvedAt) continue;
    if (isDecisionLocked(next, decision, now)) { blocked.push(`${getSku(decision.skuId)?.name || 'Item'}: held until 7:00 AM. Your morning self gets a vote.`); continue; }
    if (ownsSku(next, decision.skuId)) { blocked.push(ownedMessage(next, decision.skuId, now)); continue; }
    decision.approvedAt = now.toISOString();
    next.owned.push({ skuId: decision.skuId, acquiredAt: now.toISOString(), source: 'approved' });
    approved.push(decision.id);
  }
  // This is a local approval ledger, not a payment or merchant transaction. Approval never earns XP.
  return { profile: approved.length ? touched(next, now) : profile, approved, blocked };
}
