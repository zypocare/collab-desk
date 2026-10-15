-- Background jobs: the email outbox is processed by the `process-outbox` edge function.
-- A trigger calls it right after new emails are queued; a cron job retries every 5 minutes.
-- The function URL and shared secret live in private.job_config (set once, see docs/SETUP.md).

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.job_config (
  key    text primary key,
  value  text not null
);

create or replace function private.call_function(fn text)
returns void
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  v_url text;
  v_secret text;
begin
  select value into v_url from private.job_config where key = 'functions_url';
  select value into v_secret from private.job_config where key = 'cron_secret';
  if v_url is null or v_secret is null then
    return;
  end if;
  perform net.http_post(
    url := rtrim(v_url, '/') || '/' || fn,
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    timeout_milliseconds := 15000
  );
end;
$$;

-- Claims a batch of emails to send. Only the edge function (service role) may call it.
create or replace function public.claim_outbox(n integer default 20)
returns setof public.outbox
language sql security definer
set search_path = public
as $$
  update public.outbox o
  set status = 'sending', attempts = o.attempts + 1
  where o.id in (
    select id from public.outbox
    where attempts < 5
      and (status = 'pending' or (status = 'sending' and created_at < now() - interval '10 minutes'))
    order by id
    limit n
    for update skip locked
  )
  returning o.*;
$$;
revoke execute on function public.claim_outbox(integer) from public, anon, authenticated;
grant execute on function public.claim_outbox(integer) to service_role;

create or replace function private.kick_outbox()
returns trigger
language plpgsql security definer
as $$
begin
  perform private.call_function('process-outbox');
  return null;
end;
$$;

create trigger outbox_kick
  after insert on public.outbox
  for each statement execute function private.kick_outbox();

select cron.schedule('process-outbox', '*/5 * * * *', $$select private.call_function('process-outbox')$$);
