export type ColorScheme = 'classic' | 'palm';

export const COLOR_SCHEME_STORAGE_KEY = 'crypto-dashboard-color-scheme';
const CHANGE_EVENT = 'crypto-dashboard:color-scheme-change';

export function normalizeColorScheme(value: unknown): ColorScheme {
  return value === 'palm' ? 'palm' : 'classic';
}

// Run in <head> before the first paint; this preference is separate from
// next-themes' light/dark/system setting and defaults to the original palette.
export const COLOR_SCHEME_INIT_SCRIPT = `(()=>{let scheme='classic';try{scheme=localStorage.getItem(${JSON.stringify(COLOR_SCHEME_STORAGE_KEY)})==='palm'?'palm':'classic'}catch{}document.documentElement.setAttribute('data-color-scheme',scheme)})()`;

export function getColorScheme(): ColorScheme {
  return normalizeColorScheme(document.documentElement.dataset.colorScheme);
}

export function updateColorSchemeIcon(scheme: ColorScheme) {
  document.querySelectorAll<HTMLLinkElement>('link[rel="icon"]').forEach(icon => {
    icon.href = scheme === 'palm' ? '/icons/palm.svg' : '/icon.svg';
  });
}

export function setColorScheme(value: ColorScheme) {
  const scheme = normalizeColorScheme(value);
  document.documentElement.dataset.colorScheme = scheme;
  updateColorSchemeIcon(scheme);
  try { localStorage.setItem(COLOR_SCHEME_STORAGE_KEY, scheme); } catch { /* Still allow switching when storage is unavailable. */ }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function subscribeColorScheme(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== COLOR_SCHEME_STORAGE_KEY && event.key !== null) return;
    const scheme = normalizeColorScheme(event.newValue);
    document.documentElement.dataset.colorScheme = scheme;
    updateColorSchemeIcon(scheme);
    onChange();
  };
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onStorage);
  };
}
