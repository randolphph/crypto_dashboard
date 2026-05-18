'use client';

import { useEffect, useState } from 'react';

const BOX = 36;
const BASE_R = 26;
const PITCH = 8;
const SPACING = 1.0;
const MAX_BLOCKS = 80;
const TICK_MS = 90;
const HOLD_MS = 700;
const FADE_MS = 600;

interface Spot {
  x: number;
  y: number;
  rot: number;
}

// Archimedean spiral r = BASE_R + PITCH * theta. We walk θ in arc-length steps
// of BOX so consecutive cells form a continuous chain regardless of radius.
const POSITIONS: Spot[] = (() => {
  const arr: Spot[] = [];
  let theta = 0;
  for (let i = 0; i < MAX_BLOCKS; i++) {
    const r = BASE_R + PITCH * theta;
    const x = r * Math.cos(theta);
    const y = r * Math.sin(theta);
    const dx = -r * Math.sin(theta) + PITCH * Math.cos(theta);
    const dy = r * Math.cos(theta) + PITCH * Math.sin(theta);
    const rot = (Math.atan2(dy, dx) * 180) / Math.PI;
    arr.push({ x, y, rot });
    const arcStep = (BOX * SPACING) / Math.max(r, BOX / 2);
    theta += arcStep;
  }
  return arr;
})();

export function BlockchainBackdrop() {
  const [count, setCount] = useState(1);
  const [phase, setPhase] = useState<'growing' | 'fading'>('growing');
  const [cycle, setCycle] = useState(0);

  useEffect(() => {
    if (phase === 'fading') {
      const t = setTimeout(() => {
        setCycle((c) => c + 1);
        setCount(1);
        setPhase('growing');
      }, FADE_MS);
      return () => clearTimeout(t);
    }
    if (count >= MAX_BLOCKS) {
      const t = setTimeout(() => setPhase('fading'), HOLD_MS);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setCount((c) => c + 1), TICK_MS);
    return () => clearTimeout(t);
  }, [count, phase]);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <div className="absolute left-1/2 top-1/2">
        {POSITIONS.slice(0, count).map((p, i) => {
          const isTail = i === count - 1 && phase === 'growing';
          return (
            <div
              key={`${cycle}-${i}`}
              className="absolute border border-foreground/70"
              style={{
                width: BOX,
                height: BOX,
                left: -BOX / 2,
                top: -BOX / 2,
                transform: `translate(${p.x.toFixed(2)}px, ${p.y.toFixed(2)}px) rotate(${p.rot.toFixed(2)}deg)`,
                opacity: phase === 'fading' ? 0 : 1,
                transition: `opacity ${FADE_MS}ms ease-in-out`,
                animation: isTail
                  ? `cd-spiral-block-enter ${Math.floor(TICK_MS * 1.8)}ms ease-out`
                  : undefined,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
