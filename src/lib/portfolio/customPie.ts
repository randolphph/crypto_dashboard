export interface CustomPieValue {
  label: string;
  value: number;
  color?: string;
}

export function buildCustomPieSlices(items: CustomPieValue[]) {
  const positive = items.filter(item => Number.isFinite(item.value) && item.value > 0).slice().sort((a, b) => b.value - a.value);
  const total = positive.reduce((sum, item) => sum + item.value, 0);
  if (!Number.isFinite(total) || total <= 0) return [];
  let accumulated = 0;
  return positive.map((item, index) => {
    const share = item.value / total;
    const startAngle = -Math.PI / 2 + accumulated * Math.PI * 2;
    accumulated += share;
    return { ...item, share, startAngle, endAngle: index === positive.length - 1 ? Math.PI * 1.5 : -Math.PI / 2 + accumulated * Math.PI * 2,
      // Radius uses the real amount rather than a fabricated second metric.
      // sqrt scaling keeps the radius-squared component proportional to value.
      radiusRatio: Math.sqrt(item.value / positive[0].value),
    };
  });
}
