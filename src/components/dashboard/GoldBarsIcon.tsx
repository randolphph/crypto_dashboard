'use client';

import { createLucideIcon } from 'lucide-react';

// Two long ingots on the same 24-unit grid as the other account icons.
// The lower ingot's back edge stops where the upper one overlaps it.
export const GoldBarsIcon = createLucideIcon('GoldBars', [
  ['path', { d: 'M2 14 8.8 12.4 M16.2 11.6 21 14 8 17 2 14v4l6 3 13-3v-4 M8 17v4', key: 'lower' }],
  ['path', { d: 'M4 6 17 3 23 6v4l-13 3-6-3V6l6 3 13-3 M10 9v4', key: 'upper' }],
]);
