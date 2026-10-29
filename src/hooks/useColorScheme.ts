'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { getColorScheme, setColorScheme, subscribeColorScheme, updateColorSchemeIcon, type ColorScheme } from '@/lib/theme/colorScheme';

const getServerColorScheme = (): ColorScheme => 'classic';

export function useColorScheme() {
  const colorScheme = useSyncExternalStore(subscribeColorScheme, getColorScheme, getServerColorScheme);
  useEffect(() => updateColorSchemeIcon(colorScheme), [colorScheme]);
  return { colorScheme, setColorScheme };
}
