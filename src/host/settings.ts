import type { Settings } from '../shared/messages.ts';

export const DEFAULTS: Settings = {
  lineSpacing: 1.8,
  imageStorage: 'assetsFolder',
  embedWarningKB: 500,
};

const clampNumber = (value: unknown, min: number, max: number, fallback: number): number => {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, n));
};

/** Out-of-range or unknown values are clamped silently to the nearest allowed value. */
export function clampSettings(raw: Partial<Record<keyof Settings, unknown>>): Settings {
  return {
    lineSpacing: Math.round(clampNumber(raw.lineSpacing, 1, 2.5, DEFAULTS.lineSpacing) * 100) / 100,
    imageStorage: raw.imageStorage === 'embedded' ? 'embedded' : 'assetsFolder',
    embedWarningKB: Math.round(clampNumber(raw.embedWarningKB, 50, 5000, DEFAULTS.embedWarningKB)),
  };
}

export function clampSetting<K extends keyof Settings>(name: K, value: unknown): Settings[K] {
  return clampSettings({ [name]: value })[name];
}
