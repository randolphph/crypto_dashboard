'use client';

import { useCallback, useLayoutEffect, useRef } from 'react';
import { formatUsd } from '@/lib/format';
import { usePrivacyStore } from '@/stores/privacyStore';
import { cn } from '@/lib/utils';

const DURATION_MS = 1_500;

interface Props {
  value: number | null | undefined;
  showPositiveSign?: boolean;
  className?: string;
}

/** Presentation only: valuations, rankings and history keep their original values. */
export function AnimatedAmount({ value, showPositiveSign = false, className }: Props) {
  const hidden = usePrivacyStore(state => state.hidden);
  const rootRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const current = useRef(0);
  const entered = useRef(false);
  const format = useCallback((amount: number) => {
    return `${showPositiveSign && amount >= 0 ? '+' : ''}${formatUsd(amount)}`;
  }, [showPositiveSign]);
  const valid = typeof value === 'number' && Number.isFinite(value);
  const finalText = hidden ? '******' : valid ? format(value) : '—';

  // Layout cleanup cancels the old frame before a privacy change can paint.
  // Only this text node changes per frame; the surrounding dashboard never rerenders.
  useLayoutEffect(() => {
    const root = rootRef.current, text = textRef.current;
    if (!root || !text) return;
    if (hidden || typeof value !== 'number' || !Number.isFinite(value)) {
      current.current = 0;
      root.dataset.countState = hidden ? 'hidden' : 'unavailable';
      return;
    }
    const target = value;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0, disposed = false;
    let observer: IntersectionObserver | undefined;
    const draw = (amount: number) => {
      current.current = amount;
      text.textContent = format(amount);
    };
    const settle = () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      entered.current = true;
      draw(target);
      root.dataset.countState = 'ready';
    };
    const start = () => {
      if (disposed) return;
      entered.current = true;
      observer?.disconnect();
      if (motion.matches || current.current === target) { settle(); return; }
      const from = current.current, startedAt = performance.now();
      root.dataset.countState = 'running';
      const tick = (now: number) => {
        if (disposed) return;
        const progress = Math.min(1, Math.max(0, (now - startedAt) / DURATION_MS));
        if (progress === 1) { settle(); return; }
        draw(from + (target - from) * (1 - (1 - progress) ** 3));
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    };
    draw(entered.current ? current.current : 0);
    root.dataset.countState = 'pending';
    if (motion.matches) settle();
    else if (entered.current || typeof IntersectionObserver === 'undefined') start();
    else {
      observer = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting)) start();
      }, { threshold: .1 });
      observer.observe(root);
    }
    const onMotionChange = () => { if (motion.matches) settle(); };
    motion.addEventListener('change', onMotionChange);
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer?.disconnect();
      motion.removeEventListener('change', onMotionChange);
    };
  }, [value, hidden, format]);

  return <span ref={rootRef} data-animated-amount data-count-state={hidden ? 'hidden' : valid ? 'pending' : 'unavailable'}
    className={cn('inline-grid whitespace-nowrap tabular-nums', className)}>
    {/* Reserve the final width and give assistive technology a stable exact value. */}
    <span aria-hidden="true" className="invisible col-start-1 row-start-1">{finalText}</span>
    <span ref={textRef} data-count-text aria-hidden="true" className="col-start-1 row-start-1">{finalText}</span>
    <span className="sr-only">{finalText}</span>
  </span>;
}
