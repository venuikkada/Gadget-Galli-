import type { Translations } from './en';

type DeepPartial<T> = { [K in keyof T]?: T[K] extends string ? string : DeepPartial<T[K]> };

/** Hindi. Missing keys fall back to English. */
export const hi: DeepPartial<Translations> = {};
