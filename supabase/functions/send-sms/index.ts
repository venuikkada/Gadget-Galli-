// Supabase Auth "Send SMS" hook: sends the login OTP through MSG91 (India, DLT-registered template).
// Supabase Auth calls this for every phone OTP and signs the request (Standard Webhooks). Set up in docs/SETUP.md §2.
// Env (Edge Function secrets):
//   SEND_SMS_HOOK_SECRET  the secret shown when the hook is created (v1,whsec_…); several may be joined with "|"
//   MSG91_AUTH_KEY        MSG91 → API → Auth key
//   MSG91_TEMPLATE_ID     MSG91 template ID of the DLT-approved OTP template
//   MSG91_OTP_VAR         optional: the template's variable name, default "otp" (for ##otp##)
//   MSG91_FLOW_URL        optional: only for tests (a fake MSG91)
import { Webhook } from 'npm:standardwebhooks@1.0.0';

import { checkPhone, flowRequest, flowResult, maskPhone, MSG91_FLOW_URL } from './msg91.ts';

interface HookPayload {
  user: { phone?: string };
  sms: { otp: string };
}

/** Supabase Auth passes `message` to the app, which translates the leading code (apps/mobile/src/auth/smsError.ts). */
function hookError(httpCode: number, message: string): Response {
  return new Response(JSON.stringify({ error: { http_code: httpCode, message } }), {
    status: httpCode,
    headers: { 'Content-Type': 'application/json' },
  });
}

function verify(payload: string, headers: Record<string, string>): HookPayload | null {
  const secrets = (Deno.env.get('SEND_SMS_HOOK_SECRET') ?? '').split('|').map((s) => s.trim().replace(/^v1,whsec_/, '')).filter(Boolean);
  for (const secret of secrets) {
    try {
      return new Webhook(secret).verify(payload, headers) as HookPayload;
    } catch {
      // try the next secret (key rotation)
    }
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return hookError(405, 'Method not allowed');

  const event = verify(await req.text(), Object.fromEntries(req.headers));
  if (!event) return hookError(401, 'Invalid signature');

  const phone = checkPhone(event.user?.phone);
  if (!phone.ok) {
    console.warn(`send-sms: refused ${maskPhone(phone.mobile)} (${phone.reason})`);
    return hookError(400, phone.reason === 'demo_number' ? 'SMS_DEMO_NUMBER: This demo number cannot receive SMS.' : 'SMS_NOT_INDIAN_NUMBER: Please use an Indian mobile number.');
  }

  const authKey = Deno.env.get('MSG91_AUTH_KEY');
  const templateId = Deno.env.get('MSG91_TEMPLATE_ID');
  if (!authKey || !templateId) {
    console.error('send-sms: MSG91_AUTH_KEY or MSG91_TEMPLATE_ID is not set');
    return hookError(500, 'SMS_NOT_SET_UP: SMS is not set up yet.');
  }

  try {
    const res = await fetch(Deno.env.get('MSG91_FLOW_URL') || MSG91_FLOW_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', authkey: authKey },
      body: JSON.stringify(flowRequest(templateId, phone.mobile, event.sms.otp, Deno.env.get('MSG91_OTP_VAR') || 'otp')),
      signal: AbortSignal.timeout(8000),
    });
    const result = flowResult(res.status, await res.text());
    if (!result.ok) {
      console.error(`send-sms: ${maskPhone(phone.mobile)} ${result.message}`);
      return hookError(502, 'SMS_SEND_FAILED: Could not send the SMS.');
    }
    console.log(`send-sms: sent to ${maskPhone(phone.mobile)}, MSG91 request ${result.requestId}`);
    return new Response('{}', { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error(`send-sms: ${maskPhone(phone.mobile)} ${e instanceof Error ? e.message : String(e)}`);
    return hookError(502, 'SMS_SEND_FAILED: Could not send the SMS.');
  }
});
