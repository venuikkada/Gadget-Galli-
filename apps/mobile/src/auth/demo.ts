import { config } from '@/shared/config';

/** The seeded demo numbers: customers +91 90000 00001-00012, shop owners 10001-10016 and the new owner 19999. */
const DEMO_PHONE = /^\+9190000(000(0[1-9]|1[0-2])|100(0[1-9]|1[0-6])|19999)$/;

/**
 * On demo servers (`config.demo`) the demo numbers sign in without SMS: the number and the demo OTP become an email
 * and password login, which the demo data gives every demo phone account (supabase/seed/generate-seed.mjs). So the
 * demo works before an SMS provider is set up, and the made-up numbers are never texted. See docs/DECISIONS.md #48.
 */
export function isDemoLogin(e164: string | null | undefined): e164 is string {
  return !!config.demo && !!e164 && DEMO_PHONE.test(e164);
}

export const demoEmail = (e164: string) => `${e164.replace(/\D/g, '')}@demo.gadgetgalli.in`;

/** A wrong OTP is a wrong password, so it fails just like a wrong SMS code. */
export const demoPassword = (otp: string) => `gg-demo-${otp}`;
