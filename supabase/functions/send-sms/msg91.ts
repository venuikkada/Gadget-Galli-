// MSG91 Flow API helpers for the Send SMS auth hook (index.ts). No Deno APIs here, so msg91.test.ts can test them.
// Flow API: POST https://control.msg91.com/api/v5/flow with header `authkey`. The template is the DLT-approved OTP
// template created in MSG91 (SMS → Templates), e.g. "##otp## is your Gadget Galli login code. Do not share it with anyone."

export const MSG91_FLOW_URL = 'https://control.msg91.com/api/v5/flow';

/** Indian mobile numbers only: 91 followed by 10 digits starting 6-9. Stops SMS-pumping to premium foreign numbers. */
const INDIAN_MOBILE = /^91[6-9]\d{9}$/;

/**
 * The seeded demo numbers (keep in step with apps/mobile/src/auth/demo.ts). They are made up but fall in a real
 * mobile series, so they are never texted: demo websites sign them in by password, and app store reviewers use the
 * dashboard's test OTPs.
 */
const DEMO_NUMBER = /^9190000(000(0[1-9]|1[0-2])|100(0[1-9]|1[0-6])|19999)$/;

export type PhoneCheck = { ok: true; mobile: string } | { ok: false; reason: 'not_indian_mobile' | 'demo_number'; mobile: string };

/** Supabase passes the phone as digits with or without a leading +; MSG91 wants 91XXXXXXXXXX. */
export function checkPhone(phone: string | null | undefined): PhoneCheck {
  const mobile = (phone ?? '').replace(/\D/g, '');
  if (DEMO_NUMBER.test(mobile)) return { ok: false, reason: 'demo_number', mobile };
  if (!INDIAN_MOBILE.test(mobile)) return { ok: false, reason: 'not_indian_mobile', mobile };
  return { ok: true, mobile };
}

/** 91XXXXXXXXXX → 91XXXXXX1234 for logs. */
export const maskPhone = (mobile: string) => `${mobile.slice(0, 2)}XXXXXX${mobile.slice(-4)}`;

export interface FlowRequest {
  template_id: string;
  short_url: '0';
  realTimeResponse: '1';
  recipients: Record<string, string>[];
}

/** `otpVar` is the variable name in the MSG91 template (##otp## → "otp"); MSG91 variable names are case-sensitive. */
export function flowRequest(templateId: string, mobile: string, otp: string, otpVar = 'otp'): FlowRequest {
  return { template_id: templateId, short_url: '0', realTimeResponse: '1', recipients: [{ mobiles: mobile, [otpVar]: otp }] };
}

/** MSG91 answers {"type":"success","message":"<request id>"} or {"type":"error","message":"<reason>"}. */
export function flowResult(status: number, body: string): { ok: true; requestId: string } | { ok: false; message: string } {
  let parsed: { type?: string; message?: string } = {};
  try {
    parsed = JSON.parse(body);
  } catch {
    // not JSON: fall through with the raw text
  }
  if (status < 400 && parsed.type === 'success') return { ok: true, requestId: String(parsed.message ?? '') };
  return { ok: false, message: `MSG91 ${status}: ${String(parsed.message ?? body).slice(0, 200)}` };
}
