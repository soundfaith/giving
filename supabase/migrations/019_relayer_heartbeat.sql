create table if not exists public.relayer_heartbeat (
  id text primary key,
  last_seen_at timestamptz not null,
  last_success_at timestamptz,
  last_error text,
  last_project_id uuid,
  last_transaction_hash text
);

alter table public.relayer_heartbeat enable row level security;

create or replace function public.relayer_heartbeat_update(
  next_seen_at timestamptz,
  next_success_at timestamptz default null,
  next_error text default null,
  next_project_id uuid default null,
  next_transaction_hash text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.relayer_heartbeat (id, last_seen_at, last_success_at, last_error, last_project_id, last_transaction_hash)
  values ('default', next_seen_at, next_success_at, next_error, next_project_id, next_transaction_hash)
  on conflict (id) do update set
    last_seen_at = excluded.last_seen_at,
    last_success_at = coalesce(excluded.last_success_at, relayer_heartbeat.last_success_at),
    last_error = excluded.last_error,
    last_project_id = coalesce(excluded.last_project_id, relayer_heartbeat.last_project_id),
    last_transaction_hash = coalesce(excluded.last_transaction_hash, relayer_heartbeat.last_transaction_hash);
end;
$$;

create or replace function public.admin_get_relayer_status()
returns table (last_seen_at timestamptz, last_success_at timestamptz, last_error text, last_project_id uuid, last_transaction_hash text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_soundfaith_admin() then raise exception 'Admin access required'; end if;
  return query
    select h.last_seen_at, h.last_success_at, h.last_error, h.last_project_id, h.last_transaction_hash
    from public.relayer_heartbeat h
    where h.id = 'default';
end;
$$;

revoke all on function public.relayer_heartbeat_update(timestamptz, timestamptz, text, uuid, text) from public;
grant execute on function public.relayer_heartbeat_update(timestamptz, timestamptz, text, uuid, text) to service_role;
revoke all on function public.admin_get_relayer_status() from public;
grant execute on function public.admin_get_relayer_status() to authenticated;
