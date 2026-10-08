// Deletes the signed-in user's account: anonymises their profile (orders stay for the shop's
// records, without personal details) and removes the login.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { adminClient, corsHeaders, json } from '../_shared/admin-client.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'unauthorized' }, 401);

  // Act as the user so the database checks (no active orders) apply to them
  const asUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userError } = await asUser.auth.getUser();
  if (userError || !userData.user) return json({ error: 'unauthorized' }, 401);

  const { error: rpcError } = await asUser.rpc('delete_my_account');
  if (rpcError) return json({ error: rpcError.message }, 400);

  const { error: deleteError } = await adminClient().auth.admin.deleteUser(userData.user.id);
  if (deleteError) return json({ error: deleteError.message }, 500);
  return json({ ok: true });
});
