export type ImageStorage = 'assetsFolder' | 'embedded';

/** The user settings (contract section 6.2), already clamped. */
export interface Settings {
  lineSpacing: number;
  imageStorage: ImageStorage;
  embedWarningKB: number;
}
export type SettingName = keyof Settings;
export const SETTING_NAMES: readonly SettingName[] = ['lineSpacing', 'imageStorage', 'embedWarningKB'];

export type SaveImageResult = { ok: true; path: string } | { ok: false; reason: string };

/** Screen to host (contract section 7.9). */
export type ToHost =
  | { type: 'ready' }
  | { type: 'edit'; text: string; version: number }
  | { type: 'saveImage'; id: number; data: ArrayBuffer; name: string; mime: string }
  | { type: 'settingChanged'; name: SettingName; value: Settings[SettingName] };

/** Host to screen. */
export type ToView =
  | { type: 'load'; text: string; version: number; settings: Settings; assetBase: string }
  | { type: 'externalChange'; text: string; version: number }
  | ({ type: 'imageSaved'; id: number } & SaveImageResult)
  | { type: 'settingChanged'; name: SettingName; value: Settings[SettingName] };

/** Everything arriving from a webview is untrusted: check its shape before use. */
export function isToHost(m: unknown): m is ToHost {
  if (typeof m !== 'object' || m === null) return false;
  const x = m as Record<string, unknown>;
  switch (x.type) {
    case 'ready': return true;
    case 'edit': return typeof x.text === 'string' && typeof x.version === 'number';
    case 'saveImage': return typeof x.id === 'number' && typeof x.name === 'string' && typeof x.mime === 'string' && x.data !== undefined && x.data !== null;
    case 'settingChanged': return typeof x.name === 'string' && (SETTING_NAMES as readonly string[]).includes(x.name) && 'value' in x;
    default: return false;
  }
}
