import { supabase } from './supabase';

/** Error raised by a database function. `code` is the UPPER_CASE token at the start of the message. */
export class ApiError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

const MESSAGES: Record<string, string> = {
  NOT_AUTHENTICATED: 'Your session expired. Please log in again.',
  ADMIN_ONLY: 'Only Gadget Galli admins can do this.',
  SUPER_ADMIN_ONLY: 'Only a super admin can do this.',
  REASON_REQUIRED: 'Please write a reason. The shop owner will see it.',
  NOTE_REQUIRED: 'Please add a note explaining the change.',
  RESOLUTION_REQUIRED: 'Please describe how the problem was resolved.',
  TITLE_AND_BODY_REQUIRED: 'Title and message are required.',
  INVALID_TRANSITION: 'That status change is not allowed from the current status.',
  SAME_PRODUCT: 'Pick two different products to merge.',
  CANNOT_BLOCK_SELF: 'You cannot block your own account.',
  SHOP_NOT_FOUND: 'Shop not found.',
  ISSUE_NOT_FOUND: 'Problem report not found.',
  PRODUCT_NOT_FOUND: 'Product not found.',
};

export function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  const message = (err as { message?: string })?.message ?? String(err);
  const m = message.match(/^([A-Z][A-Z_]{2,})\b/);
  return new ApiError(m ? m[1]! : 'generic', message);
}

/** Readable message for any error from the API. */
export function errorMessage(err: unknown): string {
  const e = toApiError(err);
  if (MESSAGES[e.code]) return MESSAGES[e.code]!;
  if (/duplicate key/i.test(e.message)) return 'This already exists.';
  if (/violates foreign key/i.test(e.message)) return 'This is still used elsewhere, so it cannot be removed.';
  if (/violates check constraint/i.test(e.message)) return 'Some values are not valid. Please check the form.';
  if (/failed to fetch|network/i.test(e.message)) return 'No connection to the server.';
  return e.message || 'Something went wrong.';
}

export async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args ?? {});
  if (error) throw toApiError(error);
  return data as T;
}

/** Plain table access for admin-managed reference data (protected by RLS: admins only). */
export async function selectAll<T>(table: string, order: string, ascending = true): Promise<T[]> {
  const { data, error } = await supabase.from(table).select('*').order(order, { ascending });
  if (error) throw toApiError(error);
  return (data ?? []) as T[];
}

export async function upsertRow<T>(table: string, row: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.from(table).upsert(row).select().single();
  if (error) throw toApiError(error);
  return data as T;
}

export async function deleteRow(table: string, id: number | string) {
  const { error } = await supabase.from(table).delete().eq('id', id);
  if (error) throw toApiError(error);
}

export async function signedUrl(bucket: string, path: string | null | undefined, expiresIn = 600): Promise<string | null> {
  if (!path) return null;
  if (/^https?:\/\//.test(path)) return path;
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
  return data?.signedUrl ?? null;
}

export function publicUrl(bucket: string, path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^https?:\/\//.test(path) || path.startsWith('data:')) return path;
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

export async function uploadPublic(bucket: string, folder: string, file: File): Promise<string> {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const path = `${folder}/${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, { contentType: file.type || undefined });
  if (error) throw toApiError(error);
  return path;
}
