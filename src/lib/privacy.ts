export type PrivacyMode = 'visible' | 'amounts' | 'hidden';

export function privacyFlags(mode: PrivacyMode) {
  return { mode, hidden: mode !== 'visible', percentHidden: mode === 'hidden' };
}

export function restorePrivacy(value: unknown) {
  const saved = value && typeof value === 'object' ? value as { mode?: unknown; hidden?: unknown } : {};
  const mode = saved.mode === 'visible' || saved.mode === 'amounts' || saved.mode === 'hidden'
    ? saved.mode : saved.hidden === true ? 'hidden' : 'visible';
  return privacyFlags(mode);
}

export const nextPrivacyMode = (mode: PrivacyMode): PrivacyMode => mode === 'visible' ? 'amounts' : mode === 'amounts' ? 'hidden' : 'visible';
