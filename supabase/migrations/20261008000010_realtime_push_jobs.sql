-- Gadget Galli · 0010 · realtime, push delivery, scheduled order jobs

-- ---------------------------------------------------------------------------
-- Realtime: live order timeline for customers and instant new-order alerts for shops
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['orders', 'order_events', 'notifications'] loop
      begin
        execute format('alter publication supabase_realtime add table public.%I', t);
      exception when duplicate_object then
        null;
      end;
    end loop;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Push: every new notification row is sent to the "send-push" edge function, which
-- delivers it through Expo push. Configure once (see docs/SETUP.md):
--   insert into app_config values ('push_webhook_url', 'https://<project>.supabase.co/functions/v1/send-push'),
--                                 ('push_webhook_secret', '<random secret, same as PUSH_WEBHOOK_SECRET>');
-- ---------------------------------------------------------------------------
do $$
begin
  create extension if not exists pg_net with schema extensions;
exception when others then
  raise notice 'pg_net not available (%): pushes will be flushed by the order-jobs function instead', sqlerrm;
end $$;

create or replace function private.post_push_webhook(p_body jsonb) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_url text;
  v_secret text;
begin
  select value into v_url from public.app_config where key = 'push_webhook_url';
  select value into v_secret from public.app_config where key = 'push_webhook_secret';
  if v_url is null or not exists (select 1 from pg_namespace where nspname = 'net') then
    return;
  end if;
  execute 'select net.http_post(url := $1, body := $2, headers := $3)'
    using v_url, p_body, jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', coalesce(v_secret, ''));
exception when others then
  raise warning 'push webhook failed: %', sqlerrm;
end $$;

create or replace function private.dispatch_push() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_ids bigint[];
begin
  select array_agg(id) into v_ids from new_rows where push_status = 'pending';
  if v_ids is not null then
    perform private.post_push_webhook(jsonb_build_object('ids', to_jsonb(v_ids)));
  end if;
  return null;
end $$;

create trigger notifications_push after insert on public.notifications
  referencing new table as new_rows
  for each statement execute function private.dispatch_push();

-- ---------------------------------------------------------------------------
-- Scheduled jobs (every 5 minutes)
--   * REQUESTED with no answer for 2 hrs  -> EXPIRED
--   * DISPATCHED for 24 hrs               -> remind the customer
--   * DISPATCHED for 72 hrs               -> DELIVERED automatically
-- ---------------------------------------------------------------------------
create or replace function public.run_order_jobs() returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  r record;
  v_expired int := 0;
  v_reminded int := 0;
  v_auto int := 0;
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'ADMIN_ONLY' using errcode = '42501';
  end if;

  for r in select id from public.orders
           where status = 'REQUESTED' and requested_at < now() - interval '2 hours'
           order by requested_at for update skip locked loop
    perform private.set_order_status(r.id, 'EXPIRED', 'system', 'No response from the shop in 2 hours', '{}'::jsonb);
    v_expired := v_expired + 1;
  end loop;

  for r in select id, customer_id, order_no from public.orders
           where status = 'DISPATCHED' and dispatched_at < now() - interval '24 hours'
             and dispatched_at >= now() - interval '72 hours' and reminder_sent_at is null loop
    perform private.notify(r.customer_id, 'customer', 'receive_reminder', 'Did you get your order?',
      'Order ' || r.order_no || ' was dispatched a day ago. Tap "I received my order" once it arrives.',
      jsonb_build_object('order_id', r.id, 'url', '/order/' || r.id));
    update public.orders set reminder_sent_at = now() where id = r.id;
    v_reminded := v_reminded + 1;
  end loop;

  for r in select id from public.orders
           where status = 'DISPATCHED' and dispatched_at < now() - interval '72 hours'
           for update skip locked loop
    perform private.set_order_status(r.id, 'DELIVERED', 'system', 'Marked delivered automatically after 72 hours', '{}'::jsonb);
    v_auto := v_auto + 1;
  end loop;

  -- Retry pushes that did not go out (e.g. webhook was down)
  if exists (select 1 from public.notifications where push_status = 'pending' and created_at < now() - interval '1 minute') then
    perform private.post_push_webhook(jsonb_build_object('flush', true));
  end if;

  return jsonb_build_object('expired', v_expired, 'reminded', v_reminded, 'auto_delivered', v_auto);
end $$;

revoke execute on function public.run_order_jobs() from public, anon;
grant execute on function public.run_order_jobs() to authenticated, service_role;

do $$
begin
  create extension if not exists pg_cron with schema pg_catalog;
exception when others then
  raise notice 'pg_cron not available (%): call the order-jobs edge function on a schedule instead', sqlerrm;
end $$;

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    if exists (select 1 from cron.job where jobname = 'gg-order-jobs') then
      perform cron.unschedule('gg-order-jobs');
    end if;
    perform cron.schedule('gg-order-jobs', '*/5 * * * *', 'select public.run_order_jobs()');
  end if;
exception when others then
  raise notice 'cron schedule skipped: %', sqlerrm;
end $$;

-- Internal helpers created after 0008 must not be callable from the API either
revoke all on all functions in schema private from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on all functions in schema private from anon, authenticated';
  end if;
end $$;
