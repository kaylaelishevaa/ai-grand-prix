'use client';

import {useEffect, useRef, useState, type ReactNode} from 'react';
import type {HatchEngine, HatchPhase} from './diorama/hatch-engine';

interface HatchDioramaProps {
  hatched: boolean;
  onHatch(): void;
  phase?: HatchPhase;
  fallback: ReactNode;
}

/** WebGL is a progressive enhancement; the original hatch remains usable on every device. */
export default function HatchDiorama({hatched, onHatch, phase = 'dawn', fallback}: HatchDioramaProps) {
  const host = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null);
  const engine = useRef<HatchEngine | null>(null);
  const latest = useRef({hatched, phase}); latest.current = {hatched, phase};
  const [failed, setFailed] = useState(false), [ready, setReady] = useState(false);

  useEffect(() => {
    if (failed || !canvas.current || !host.current) return;
    let cancelled = false;
    let observer: ResizeObserver | undefined;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const fail = () => { if (!cancelled) { setReady(false); setFailed(true); } };
    import('./diorama/hatch-engine').then(({createHatchDiorama}) => {
      if (cancelled || !canvas.current || !host.current) return;
      try {
        engine.current = createHatchDiorama(canvas.current, {
          ...latest.current,
          reducedMotion: media.matches,
          onReady: () => { if (!cancelled) setReady(true); },
          onFailure: fail,
        });
        observer = new ResizeObserver(entries => {
          const bounds = entries[0]?.contentRect;
          if (bounds) engine.current?.resize(bounds.width, bounds.height);
        });
        observer.observe(host.current);
      } catch { fail(); }
    }).catch(fail);
    return () => { cancelled = true; observer?.disconnect(); engine.current?.dispose(); engine.current = null; };
  }, [failed]);
  useEffect(() => { engine.current?.setHatched(hatched); }, [hatched]);
  useEffect(() => { engine.current?.setPhase(phase); }, [phase]);

  if (failed) return <>{fallback}</>;
  return <div ref={host} className="hatch-diorama" data-state={ready ? hatched ? 'hatched' : 'ready' : 'loading'}
    onPointerMove={event => {
      const bounds = event.currentTarget.getBoundingClientRect();
      engine.current?.setPointer((event.clientX - bounds.left) / bounds.width * 2 - 1, (event.clientY - bounds.top) / bounds.height * 2 - 1);
    }} onPointerLeave={() => engine.current?.setPointer(0, 0)}>
    {!ready && <div className="hatch-diorama-loading">{fallback}</div>}
    <canvas ref={canvas} className="hatch-diorama-canvas" aria-hidden="true" style={{width: '100%', height: '100%', display: 'block', opacity: ready ? 1 : 0}}/>
    {ready && <button className="hatch-diorama-trigger" type="button" onClick={onHatch} disabled={hatched} aria-label={hatched ? 'COUPI has hatched' : 'Tap to hatch COUPI'}><span className="sr-only">{hatched ? 'COUPI has hatched' : 'Tap to hatch COUPI'}</span></button>}
  </div>;
}
