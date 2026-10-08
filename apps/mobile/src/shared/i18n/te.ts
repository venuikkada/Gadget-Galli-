import type { Translations } from './en';

type DeepPartial<T> = { [K in keyof T]?: T[K] extends string ? string : DeepPartial<T[K]> };

/** Telugu. Missing keys fall back to English. */
export const te: DeepPartial<Translations> = {};
