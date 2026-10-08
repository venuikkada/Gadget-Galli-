// Sends pending rows of public.notifications as Expo push notifications.
// Called by the database (pg_net) right after notifications are inserted, with {"ids": [...]},
// and by order-jobs every few minutes with {"flush": true} to retry anything left pending.
// Auth: header x-webhook-secret must equal the PUSH_WEBHOOK_SECRET env var.
import { adminClient, json } from '../_shared/admin-client.ts';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

interface NotificationRow {
  id: number;
  user_id: string;
  app: string;
  kind: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
}

Deno.serve(async (req) => {
  const secret = Deno.env.get('PUSH_WEBHOOK_SECRET');
  if (!secret || req.headers.get('x-webhook-secret') !== secret) {
    return json({ error: 'unauthorized' }, 401);
  }
  const payload = await req.json().catch(() => ({}));
  const supabase = adminClient();

  let query = supabase
    .from('notifications')
    .select('id,user_id,app,kind,title,body,data')
    .eq('push_status', 'pending')
    .order('id')
    .limit(500);
  if (Array.isArray(payload.ids) && payload.ids.length > 0) query = query.in('id', payload.ids);
  const { data: notes, error } = await query;
  if (error) return json({ error: error.message }, 500);
  if (!notes?.length) return json({ sent: 0 });

  const userIds = [...new Set(notes.map((n) => n.user_id))];
  const { data: tokens } = await supabase.from('push_tokens').select('token,user_id').in('user_id', userIds);

  const messages: { notificationId: number; message: Record<string, unknown> }[] = [];
  for (const n of notes as NotificationRow[]) {
    const isNewOrder = n.kind === 'new_order';
    for (const t of (tokens ?? []).filter((t) => t.user_id === n.user_id)) {
      messages.push({
        notificationId: n.id,
        message: {
          to: t.token,
          title: n.title,
          body: n.body,
          data: { ...n.data, kind: n.kind, notification_id: n.id },
          sound: isNewOrder ? 'new_order.wav' : 'default',
          channelId: isNewOrder ? 'new-orders' : 'order-updates',
          priority: 'high',
          ttl: isNewOrder ? 7200 : 86400,
        },
      });
    }
  }

  const failed = new Set<number>();
  const deadTokens: string[] = [];
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...(Deno.env.get('EXPO_ACCESS_TOKEN') ? { Authorization: `Bearer ${Deno.env.get('EXPO_ACCESS_TOKEN')}` } : {}),
        },
        body: JSON.stringify(chunk.map((m) => m.message)),
      });
      const out = await res.json();
      (out.data ?? []).forEach((ticket: { status: string; details?: { error?: string } }, idx: number) => {
        if (ticket.status !== 'ok') {
          failed.add(chunk[idx].notificationId);
          if (ticket.details?.error === 'DeviceNotRegistered') deadTokens.push(String(chunk[idx].message.to));
        }
      });
    } catch (_e) {
      chunk.forEach((m) => failed.add(m.notificationId));
    }
  }

  if (deadTokens.length) await supabase.from('push_tokens').delete().in('token', deadTokens);

  const withTokens = new Set(messages.map((m) => m.notificationId));
  const sentIds = notes.filter((n) => withTokens.has(n.id) && !failed.has(n.id)).map((n) => n.id);
  const skippedIds = notes.filter((n) => !withTokens.has(n.id)).map((n) => n.id);
  if (sentIds.length) await supabase.from('notifications').update({ push_status: 'sent' }).in('id', sentIds);
  if (skippedIds.length) await supabase.from('notifications').update({ push_status: 'skipped' }).in('id', skippedIds);
  if (failed.size) {
    await supabase.from('notifications').update({ push_status: 'failed', push_error: 'expo_error' }).in('id', [...failed]);
  }
  return json({ sent: sentIds.length, skipped: skippedIds.length, failed: failed.size });
});
