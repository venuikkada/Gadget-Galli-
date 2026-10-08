import { supabase } from './supabase';

/** Error from a database function. `code` is the leading UPPER_CASE token of the message (e.g. SHOP_CLOSED). */
export class ApiError extends Error {
  code: string;
  detail: string | null;

  constructor(code: string, message: string, detail: string | null = null) {
    super(message);
    this.code = code;
    this.detail = detail;
  }
}

export function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  const message = (err as { message?: string })?.message ?? String(err);
  if (/network request failed|failed to fetch|networkerror|load failed/i.test(message)) {
    return new ApiError('network', message);
  }
  const m = message.match(/^([A-Z][A-Z_]{2,})(?::\s*(.*))?$/s);
  if (m) return new ApiError(m[1]!, message, m[2] ?? null);
  return new ApiError('generic', message);
}

/** Calls a Postgres function through PostgREST and throws ApiError on failure. */
export async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args ?? {});
  if (error) throw toApiError(error);
  return data as T;
}

/** Friendly, translated message for any error thrown by the API layer. */
export function errorText(err: unknown, t: (key: string, opts?: Record<string, unknown>) => string): string {
  const e = toApiError(err);
  const key = `error.${e.code}`;
  const translated = t(key);
  if (translated && translated !== key) return e.detail && e.code === 'ITEM_UNAVAILABLE' ? `${translated} (${e.detail})` : translated;
  return t('error.generic');
}
