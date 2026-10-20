import { toApiError } from '@/shared/api/rpc';

type T = (key: string, opts?: Record<string, unknown>) => string;

/**
 * Friendly text for a failed "send OTP". The SMS hook (supabase/functions/send-sms) puts a code such as
 * SMS_NOT_INDIAN_NUMBER at the start of its message; Supabase Auth adds its own codes (rate limit, provider off).
 */
export function smsErrorText(err: unknown, t: T): string {
  const e = err as { code?: string; status?: number; message?: string };
  const text = `${e?.code ?? ''} ${e?.message ?? ''}`;
  if (/SMS_NOT_INDIAN_NUMBER/.test(text)) return t('auth.smsIndianOnly');
  if (/SMS_DEMO_NUMBER/.test(text)) return t('auth.smsDemoNumber');
  if (/SMS_NOT_SET_UP|phone_provider_disabled|unsupported phone provider/i.test(text)) return t('auth.smsNotSetUp');
  if (/over_sms_send_rate_limit|rate limit/i.test(text) || e?.status === 429) return t('error.RATE_LIMITED');
  if (/SMS_SEND_FAILED|sms_send_failed|hook/i.test(text)) return t('auth.smsFailed');
  if (toApiError(err).code === 'network') return t('error.network');
  return t('error.generic');
}
