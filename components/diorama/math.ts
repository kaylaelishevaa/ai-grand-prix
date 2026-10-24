import type { SceneKind } from '../../lib/scenes';

/** Tiny renderer-independent motion helpers, shared by the room and hatch. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** A normalized, lightly underdamped spring. Endpoints are exact. */
export function spring01(progress: number): number {
  if (progress <= 0) return 0;
  if (progress >= 1) return 1;
  return 1 - Math.exp(-6.5 * progress) * Math.cos(10 * progress);
}

export function damp(current: number, target: number, lambda: number, deltaSeconds: number): number {
  return current + (target - current) * (1 - Math.exp(-lambda * Math.max(0, deltaSeconds)));
}

const RAD = Math.PI / 180;

/** Offsets from the fixed isometric angle. Idle yaw peaks at 0.5 degrees/second. */
export function cameraOrbit(elapsedSeconds: number, pointerX: number, pointerY: number) {
  return {
    yaw: (clamp(pointerX, -1, 1) * 6 + Math.sin(elapsedSeconds * 0.25) * 2) * RAD,
    pitch: (clamp(pointerY, -1, 1) * 4 + Math.sin(elapsedSeconds * 0.19) * 0.6) * RAD,
  };
}

type FrameBudgetOptions = { thresholdFps?: number; durationMs?: number; windowMs?: number };

/**
 * Measures consecutive low-FPS windows, rather than treating a single slow
 * frame or a backgrounded tab as a weak GPU. A true sample latches until reset.
 */
export function createFrameBudgetMonitor({ thresholdFps = 30, durationMs = 3000, windowMs = 500 }: FrameBudgetOptions = {}) {
  let last: number | null = null;
  let elapsed = 0;
  let frames = 0;
  let lowSince: number | null = null;
  let failed = false;
  const reset = () => {
    last = null;
    elapsed = 0;
    frames = 0;
    lowSince = null;
    failed = false;
  };
  return {
    reset,
    sample(timestampMs: number, active = true): boolean {
      if (!active || !Number.isFinite(timestampMs)) {
        reset();
        return false;
      }
      if (failed) return true;
      if (last === null) {
        last = timestampMs;
        return false;
      }
      const delta = timestampMs - last;
      last = timestampMs;
      if (delta <= 0) {
        elapsed = frames = 0;
        lowSince = null;
        return false;
      }
      elapsed += delta;
      frames += 1;
      if (elapsed + 0.001 < windowMs) return false;
      const fps = frames * 1000 / elapsed;
      if (fps < thresholdFps - 0.01) {
        if (lowSince === null) lowSince = timestampMs - elapsed;
        failed = timestampMs - lowSince >= durationMs;
      } else {
        lowSince = null;
      }
      elapsed = frames = 0;
      return failed;
    },
  };
}

export type RoomSlot = { key: string; x: number; y: number; z: number; surface?: number; scale?: number; hangAt?: number };

const slots: RoomSlot[] = [
  { key: 'counter', x: -1.35, y: 1.28, z: -1.18 },
  { key: 'hook', x: -2.18, y: 1.50, z: 0.18 },
  { key: 'table-left', x: -0.48, y: 1.03, z: 1.00 },
  { key: 'table-right', x: 1.17, y: 1.03, z: 0.91 },
  { key: 'shelf', x: 1.48, y: 1.73, z: -1.56 },
  { key: 'sideboard', x: 2.15, y: 0.85, z: 0.10 },
];

/** Reserve each product's proper location before placing category duplicates. */
function assignKitchenSlots(items: { type: string; name: string }[]): RoomSlot[] {
  const used = new Set<number>();
  const preferred = items.map(item => {
    const label = `${item.type} ${item.name}`.toLowerCase();
    // An explicit apron must hang even when its marketing name contains another type.
    return /^(apron|towel)$/.test(item.type.toLowerCase()) ? 1
      : /kettle|coffee|cooker|espresso/.test(label) ? 0
      : /apron|linen|towel/.test(label) ? 1
      : /mug|cup|matcha|bowl/.test(label) ? 2
      : /tray|plate|board/.test(label) ? 3
      : /speaker|radio|lamp/.test(label) ? 4 : 5;
  });
  const result: (RoomSlot | undefined)[] = preferred.map(slot => {
    if (used.has(slot)) return undefined;
    used.add(slot);
    return { ...slots[slot] };
  });
  let extraHangers = 0;
  let extraSurfaceItems = 0;
  return result.map((reserved, index) => {
    if (reserved) return reserved;
    if (preferred[index] === 1) {
      // Multiple aprons share the wall, never float on a table or shelf.
      extraHangers += 1;
      const offset = Math.ceil(extraHangers / 2) * .55 * (extraHangers % 2 ? -1 : 1);
      return { ...slots[1], z: slots[1].z + offset };
    }
    const fallback = slots.findIndex((_, slot) => slot !== 1 && !used.has(slot));
    if (fallback >= 0) {
      used.add(fallback);
      return { ...slots[fallback] };
    }
    // Six tabletop products can share the large table; a hook is not a surface.
    extraSurfaceItems += 1;
    return { ...slots[2], z: slots[2].z - extraSurfaceItems * .52 };
  });
}

const deskSlots: RoomSlot[] = [
  { key: 'desk-left', x: -1.11, y: 1.06, z: -.92, surface: 1.06 },
  { key: 'desk-right', x: .26, y: 1.06, z: -.83, surface: 1.06 },
  { key: 'display-shelf', x: 1.76, y: 1.71, z: -1.62, surface: 1.71, scale: .8 },
  { key: 'desk-cabinet', x: 2.04, y: .81, z: .08, surface: .81 },
  { key: 'low-table-left', x: -.42, y: .66, z: 1.37, surface: .66, scale: .8 },
  { key: 'low-table-right', x: .63, y: .66, z: 1.37, surface: .66, scale: .8 },
];

const readingSlots: RoomSlot[] = [
  { key: 'reading-side-table', x: .72, y: .88, z: .3, surface: .88, scale: .8 },
  { key: 'bookcase-high', x: 1.83, y: 1.69, z: -1.55, surface: 1.69, scale: .8 },
  { key: 'bookcase-low', x: 1.83, y: .91, z: -1.55, surface: .91, scale: .8 },
  { key: 'ottoman-tray', x: -.81, y: .68, z: 1.4, surface: .68, scale: .8 },
  { key: 'reading-console', x: -1.36, y: 1.05, z: -1.55, surface: 1.05, scale: .85 },
  { key: 'reading-stool', x: 1.9, y: .59, z: 1.36, surface: .59, scale: .8 },
];

const dressingSlots: RoomSlot[] = [
  { key: 'wardrobe-left', x: -1.94, y: 2.27, z: -1.13, hangAt: 2.27, scale: 1 },
  { key: 'wardrobe-right', x: -1.05, y: 2.27, z: -1.13, hangAt: 2.27, scale: 1 },
  { key: 'vanity-left', x: .68, y: 1.055, z: -1.18, surface: 1.055, scale: .58 },
  { key: 'vanity-right', x: 1.58, y: 1.055, z: -1.18, surface: 1.055, scale: .58 },
  { key: 'dressing-bench', x: -1.33, y: .64, z: 1.16, surface: .64, scale: .85 },
  { key: 'accessory-table', x: 1.64, y: .73, z: 1.16, surface: .73, scale: .6 },
  { key: 'vanity-front-left', x: .65, y: 1.055, z: -.64, surface: 1.055, scale: .58 },
  { key: 'vanity-front-right', x: 1.57, y: 1.055, z: -.64, surface: 1.055, scale: .58 },
];

/** Layout semantics match the furniture, including clothes hung from their hook. */
export function assignRoomSlots(items: { type: string; name: string }[], kind: SceneKind = 'kitchen'): RoomSlot[] {
  if (kind === 'kitchen') return assignKitchenSlots(items);
  const layout = kind === 'dressing' ? dressingSlots : kind === 'reading' ? readingSlots : deskSlots;
  const preferred = items.map(item => {
    const type = item.type.toLowerCase();
    const label = `${type} ${item.name}`.toLowerCase();
    if (kind === 'dressing') {
      if (/dress|apron/.test(type)) return 0;
      if (/blouse|shirt|jacket|towel/.test(type)) return 1;
      if (/handbag|bag|shoes/.test(type)) return 4;
      if (/earrings|jewelry/.test(type)) return 5;
      return /lipstick|perfume/.test(type) ? 2 : 3;
    }
    if (kind === 'reading') return /lamp|light/.test(label) ? 4 : /speaker|radio/.test(label) ? 1 : /tray|board/.test(label) ? 3 : /book|notebook/.test(label) ? 2 : /mug|cup|matcha/.test(label) ? 0 : 5;
    return /lamp|light/.test(label) ? 1 : /speaker|radio/.test(label) ? 2 : /notebook|book|organizer|pen/.test(label) ? 0 : /tray|board/.test(label) ? 4 : /mug|cup|coffee|matcha/.test(label) ? 5 : 3;
  });
  const used = new Set<number>();
  // Reserve first choices before duplicates, so an early cosmetic cannot steal a clothes rail.
  const reserved = preferred.map(index => {
    if (used.has(index)) return undefined;
    used.add(index);
    return { ...layout[index] };
  });
  let overflow = 0;
  return reserved.map((slot, index) => {
    if (slot) return slot;
    const clothing = kind === 'dressing' && preferred[index] < 2;
    const candidates = kind === 'dressing' ? (clothing ? [0, 1] : [2, 3, 6, 7, 5, 4]) : layout.map((_, candidate) => candidate);
    const available = candidates.find(candidate => !used.has(candidate)) ?? -1;
    if (available >= 0) {
      used.add(available);
      return { ...layout[available] };
    }
    overflow++;
    const base = layout[clothing ? 0 : kind === 'dressing' ? 6 : 4];
    return { ...base, x: base.x + (clothing ? .27 : .25) * overflow, z: base.z + (clothing ? .22 : .15) * overflow };
  });
}

export type BillboardAnchor = { skuId: string; x: number; y: number; width: number; height: number; scale: number };
export type BillboardLayout = BillboardAnchor & { left: number; top: number; leaderX: number; leaderY: number };
type Rectangle = { left: number; top: number; width: number; height: number };
function intersects(a: Rectangle, b: Rectangle, gap = 0) {
  return a.left < b.left + b.width + gap && a.left + a.width + gap > b.left && a.top < b.top + b.height + gap && a.top + a.height + gap > b.top;
}

/** Six-label screen-space packing. Physical product dots never move with their labels. */
export function layoutBillboards(anchors: BillboardAnchor[], width: number, height: number): BillboardLayout[] {
  const placed: BillboardLayout[] = [];
  const margin = 10, gap = 7;
  const markers = anchors.map(anchor => ({left: anchor.x - 10, top: anchor.y - 10, width: 20, height: 20}));
  for (const anchor of anchors) {
    const desired = {left: anchor.x - anchor.width / 2, top: anchor.y - anchor.height - 15};
    const candidates: Rectangle[] = [];
    const add = (left: number, top: number) => candidates.push({
      left: clamp(left, margin, Math.max(margin, width - anchor.width - margin)),
      top: clamp(top, margin, Math.max(margin, height - anchor.height - 28)),
      width: anchor.width, height: anchor.height,
    });
    // Nearby candidates keep the cards attached to their scene context.
    for (let row = -2; row <= 2; row++) for (let column = -2; column <= 2; column++) {
      add(desired.left + column * (anchor.width + gap), desired.top + row * (anchor.height + gap));
    }
    // A sparse edge-to-edge scan guarantees useful space on narrow district cards.
    for (let y = margin; y <= height - anchor.height - 28; y += anchor.height + gap) {
      for (let x = margin; x <= width - anchor.width - margin; x += anchor.width + gap) add(x, y);
    }
    let best = candidates[0], bestCost = Infinity;
    for (const candidate of candidates) {
      const overlap = placed.filter(other => intersects(candidate, other, gap)).length;
      const obscuresDot = markers.filter(marker => intersects(candidate, marker, 3)).length;
      const cost = overlap * 1e9 + obscuresDot * 1e7 + (candidate.left - desired.left) ** 2 + (candidate.top - desired.top) ** 2;
      if (cost < bestCost) { best = candidate; bestCost = cost; }
    }
    const leaderX = clamp(anchor.x, best.left + 4, best.left + best.width - 4);
    const leaderY = clamp(anchor.y, best.top + 4, best.top + best.height - 4);
    placed.push({...anchor, ...best, leaderX, leaderY});
  }
  return placed;
}
