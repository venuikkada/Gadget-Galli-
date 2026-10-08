// Runs the order jobs (expire unanswered requests, 24 hr reminders, 72 hr auto-delivery) and
// retries pending pushes. Use this when pg_cron is not available: schedule a call every 5 minutes
// (Supabase Dashboard -> Integrations -> Cron, or any external cron) with header x-cron-secret.
import { adminClient, json } from '../_shared/admin-client.ts';

Deno.serve(async (req) => {
  const secret = Deno.env.get('CRON_SECRET');
  if (!secret || req.headers.get('x-cron-secret') !== secret) {
    return json({ error: 'unauthorized' }, 401);
  }
  const supabase = adminClient();
  const { data, error } = await supabase.rpc('run_order_jobs');
  if (error) return json({ error: error.message }, 500);

  let push: unknown = null;
  const pushSecret = Deno.env.get('PUSH_WEBHOOK_SECRET');
  if (pushSecret) {
    const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-webhook-secret': pushSecret },
      body: JSON.stringify({ flush: true }),
    });
    push = await res.json().catch(() => null);
  }
  return json({ jobs: data, push });
});
