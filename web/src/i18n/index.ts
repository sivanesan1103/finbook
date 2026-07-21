import { en } from './en';
import { ta } from './ta';

export type Lang = 'en' | 'ta';
export const dictionaries = { en, ta };

export function interpolate(str: string, vars?: Record<string, string | number>): string {
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (_, key) => (key in vars ? String(vars[key]) : `{${key}}`));
}

export { en, ta };
export type { TranslationKey } from './en';
