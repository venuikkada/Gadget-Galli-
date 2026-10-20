// deno test supabase/functions/send-sms
import { assertEquals } from 'jsr:@std/assert@1';

import { checkPhone, flowRequest, flowResult, maskPhone } from './msg91.ts';

Deno.test('Indian mobile numbers are accepted with or without +', () => {
  assertEquals(checkPhone('+919876543210'), { ok: true, mobile: '919876543210' });
  assertEquals(checkPhone('919876543210'), { ok: true, mobile: '919876543210' });
  assertEquals(checkPhone('916000000000').ok, true);
});

Deno.test('foreign, landline-like and short numbers are refused', () => {
  for (const p of ['+14155550100', '+447700900123', '911234567890', '91987654321', '', null, undefined]) {
    assertEquals(checkPhone(p).ok, false, String(p));
  }
  assertEquals(checkPhone('+14155550100'), { ok: false, reason: 'not_indian_mobile', mobile: '14155550100' });
});

Deno.test('demo numbers are never texted, but neighbouring real numbers are', () => {
  for (const p of ['+919000000001', '+919000000012', '+919000010001', '+919000010016', '+919000019999']) {
    assertEquals(checkPhone(p), { ok: false, reason: 'demo_number', mobile: p.slice(1) });
  }
  for (const p of ['+919000000013', '+919000010017', '+919000020000', '+919000012345']) {
    assertEquals(checkPhone(p).ok, true, p);
  }
});

Deno.test('the Flow request carries the OTP in the template variable', () => {
  assertEquals(flowRequest('tmpl1', '919876543210', '482913'), {
    template_id: 'tmpl1',
    short_url: '0',
    realTimeResponse: '1',
    recipients: [{ mobiles: '919876543210', otp: '482913' }],
  });
  assertEquals(flowRequest('tmpl1', '919876543210', '482913', 'OTP').recipients, [{ mobiles: '919876543210', OTP: '482913' }]);
});

Deno.test('MSG91 responses', () => {
  assertEquals(flowResult(200, '{"type":"success","message":"3463686b6c34303732393238"}'), { ok: true, requestId: '3463686b6c34303732393238' });
  assertEquals(flowResult(200, '{"type":"error","message":"Invalid template"}'), { ok: false, message: 'MSG91 200: Invalid template' });
  assertEquals(flowResult(401, '{"type":"error","message":"Authentication failure"}').ok, false);
  assertEquals(flowResult(502, '<html>Bad gateway</html>'), { ok: false, message: 'MSG91 502: <html>Bad gateway</html>' });
});

Deno.test('logs show only the last four digits', () => {
  assertEquals(maskPhone('919876543210'), '91XXXXXX3210');
});
