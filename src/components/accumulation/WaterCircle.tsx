'use client';

import { useId, useState, useSyncExternalStore } from 'react';

const pendingBudgetFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const MOTION_QUERY = '(prefers-reduced-motion: reduce)';
const getReducedMotion = () => window.matchMedia(MOTION_QUERY).matches;
const subscribeMotion = (onChange: () => void) => {
  const media = window.matchMedia(MOTION_QUERY);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
};

const RAINBOW_STOPS = [
  ['0%', 'var(--accumulation-rainbow-red)'],
  ['14%', 'var(--accumulation-rainbow-orange)'],
  ['28%', 'var(--accumulation-rainbow-amber)'],
  ['43%', 'var(--accumulation-rainbow-green)'],
  ['57%', 'var(--accumulation-rainbow-cyan)'],
  ['72%', 'var(--accumulation-rainbow-blue)'],
  ['86%', 'var(--accumulation-rainbow-violet)'],
  ['93%', 'var(--accumulation-rainbow-pink)'],
  ['100%', 'var(--accumulation-rainbow-red)'],
] as const;

// Water height represents current AI holdings divided by the target.
export function WaterCircle({
  progress,
  pendingBudget,
  hidden,
  percentHidden,
}: {
  progress: number;
  pendingBudget: number;
  hidden: boolean;
  percentHidden: boolean;
}) {
  const id = useId();
  const reducedMotion = useSyncExternalStore(subscribeMotion, getReducedMotion, () => true);
  const [replayKey, setReplayKey] = useState(0);
  const pendingAmount = hidden ? '****' : Number.isFinite(pendingBudget) ? pendingBudgetFormatter.format(pendingBudget) : '—';
  const size = 200;
  const r = size / 2;
  const pct = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
  // 水面 Y:满格在顶部(0),空时在底部(size)。多留一点余量,空/满时水
  // 面不会贴边露出直角。
  const level = size * (1 - pct);
  // 满进度时仍把水面保留在圆顶下方，避免波浪完全移出视口。
  const visibleLevel = pct > 0 ? Math.max(10, level) : level;
  const clipId = `${id}-clip`;
  const gradId = `${id}-gradient`;
  const backGradId = `${id}-back`;
  const frontGradId = `${id}-front`;
  const backDuration = '6s';
  const frontDuration = '3.8s';

  // 一个周期 = size,路径横跨两个周期(2·size),向左平移一个周期即可
  // 无缝循环。两层波形振幅/相位/速度不同,叠出层次。
  const wave = (amp: number) =>
    `M 0 0
     Q ${size * 0.25} ${-amp}, ${size * 0.5} 0
     T ${size} 0
     T ${size * 1.5} 0
     T ${size * 2} 0
     L ${size * 2} ${size}
     L 0 ${size} Z`;

  return (
    <button
      type="button"
      aria-label="AI 仓位水位球，点击重播动画"
      onClick={() => setReplayKey(key => key + 1)}
      className="pointer-events-auto block w-[200px] max-w-[50%] cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
      data-position-water-circle
    >
      <svg
        key={replayKey}
        role="progressbar"
        aria-label="AI 目标完成度"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percentHidden || !Number.isFinite(progress) ? undefined : Math.round(pct * 100)}
        aria-valuetext={percentHidden ? '已隐藏' : `${Math.round(pct * 100)}%，待加额度 ${pendingAmount}`}
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="block h-auto w-full drop-shadow-sm"
      >
        <title>{percentHidden ? 'AI 仓位已隐藏' : `${Math.round(pct * 100)}% · 待加额度 ${pendingAmount}`}</title>
        <defs>
          <clipPath id={clipId}>
            <circle cx={r} cy={r} r={r - 2} />
          </clipPath>
          {/* 首尾同色闭合，色带随经典 / Palm 主题切换。 */}
          <linearGradient
            id={gradId}
            gradientUnits="userSpaceOnUse"
            x1="0"
            y1="0"
            x2={size}
            y2="0"
            colorInterpolation="sRGB"
          >
            <RainbowStops />
          </linearGradient>
          {/* 波形移动时反向补偿渐变坐标，让颜色固定在圆内，仅水面移动。 */}
          <linearGradient
            id={backGradId}
            gradientUnits="userSpaceOnUse"
            x1="0"
            y1="0"
            x2={size}
            y2="0"
            colorInterpolation="sRGB"
          >
            <RainbowStops />
            {!reducedMotion && <animateTransform
              attributeName="gradientTransform"
              type="translate"
              from="0 0"
              to={`${size} 0`}
              dur={backDuration}
              repeatCount="indefinite"
            />}
          </linearGradient>
          <linearGradient
            id={frontGradId}
            gradientUnits="userSpaceOnUse"
            x1="0"
            y1="0"
            x2={size}
            y2="0"
            colorInterpolation="sRGB"
          >
            <RainbowStops />
            {!reducedMotion && <animateTransform
              attributeName="gradientTransform"
              type="translate"
              from={`${size} 0`}
              to="0 0"
              dur={frontDuration}
              repeatCount="indefinite"
            />}
          </linearGradient>
        </defs>

        <g clipPath={`url(#${clipId})`}>
          {/* 极淡底色让空水位保持可读，但不干扰水面边界。 */}
          <rect
            width={size}
            height={size}
            fill={`url(#${gradId})`}
            fillOpacity="var(--accumulation-water-base-opacity)"
          />
          {/* 直接绘制两层水体，避免部分浏览器不刷新动画 clipPath。 */}
          <g data-water-level={visibleLevel} transform={`translate(0 ${visibleLevel})`}>
            <path
              d={wave(9)}
              fill={`url(#${backGradId})`}
              fillOpacity="var(--accumulation-water-back-opacity)"
              stroke={`url(#${backGradId})`}
              strokeOpacity="var(--accumulation-water-back-stroke-opacity)"
              strokeWidth={1.5}
            >
              {!reducedMotion && <animateTransform
                attributeName="transform"
                type="translate"
                from="0 0"
                to={`${-size} 0`}
                dur={backDuration}
                repeatCount="indefinite"
              />}
            </path>
            <path
              d={wave(6)}
              fill={`url(#${frontGradId})`}
              fillOpacity="var(--accumulation-water-front-opacity)"
              stroke={`url(#${frontGradId})`}
              strokeOpacity="var(--accumulation-water-front-stroke-opacity)"
              strokeWidth={2}
            >
              {!reducedMotion && <animateTransform
                attributeName="transform"
                type="translate"
                from={`${-size} 0`}
                to="0 0"
                dur={frontDuration}
                repeatCount="indefinite"
              />}
            </path>
          </g>
        </g>

        {/* 渐变描边压在水面之上。 */}
        <circle
          cx={r}
          cy={r}
          r={r - 2}
          fill="none"
          stroke={`url(#${gradId})`}
          strokeOpacity="var(--accumulation-water-outline-opacity)"
          strokeWidth={2}
        />

        {/* 中央进度数字 */}
        <text
          x={r}
          y={r - 6}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={34}
          fontWeight={800}
          className="fill-foreground"
        >
          {percentHidden ? '**%' : Number.isFinite(progress) ? `${(pct * 100).toFixed(0)}%` : '—'}
        </text>
        <text
          x={r}
          y={r + 22}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={13}
          fontWeight={600}
          className="fill-muted-foreground"
        >
          待加额度 {pendingAmount}
        </text>
      </svg>
    </button>
  );
}

function RainbowStops() {
  return RAINBOW_STOPS.map(([offset, stopColor]) => (
    <stop key={offset} offset={offset} stopColor={stopColor} />
  ));
}
