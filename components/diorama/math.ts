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

export type RoomSlot = { key: string; x: number; y: number; z: number };

const slots: RoomSlot[] = [
  { key: 'counter', x: -1.35, y: 1.28, z: -1.18 },
  { key: 'hook', x: -2.18, y: 1.50, z: 0.18 },
  { key: 'table-left', x: -0.48, y: 1.03, z: 1.00 },
  { key: 'table-right', x: 1.17, y: 1.03, z: 0.91 },
  { key: 'shelf', x: 1.48, y: 1.73, z: -1.56 },
  { key: 'sideboard', x: 2.15, y: 0.85, z: 0.10 },
];

/** Reserve each product's proper location before placing category duplicates. */
export function assignRoomSlots(items: { type: string; name: string }[]): RoomSlot[] {
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
