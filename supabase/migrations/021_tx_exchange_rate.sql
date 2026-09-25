-- Manual TX/USD rate used for display and converting dollar project goals to TX on-chain.
create table if not exists public.tx_exchange_rates (
  id boolean primary key default true check (id),
  tx_usd_rate numeric not null check (tx_usd_rate > 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

insert into public.tx_exchange_rates (id, tx_usd_rate)
values (true, 1)
on conflict (id) do nothing;

alter table public.tx_exchange_rates enable row level security;

drop policy if exists "anyone can read the current TX rate" on public.tx_exchange_rates;
create policy "anyone can read the current TX rate" on public.tx_exchange_rates
  for select using (true);

grant select on public.tx_exchange_rates to anon, authenticated;

create or replace function public.admin_get_tx_exchange_rate()
returns table (tx_usd_rate numeric, updated_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_soundfaith_admin() then raise exception 'Admin access required'; end if;
  return query select r.tx_usd_rate, r.updated_at from public.tx_exchange_rates r where r.id = true;
end;
$$;

create or replace function public.admin_set_tx_exchange_rate(next_tx_usd_rate numeric)
returns table (tx_usd_rate numeric, updated_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_soundfaith_admin() then raise exception 'Admin access required'; end if;
  if next_tx_usd_rate <= 0 then raise exception 'TX rate must be greater than zero'; end if;
  insert into public.tx_exchange_rates (id, tx_usd_rate, updated_at, updated_by)
    values (true, next_tx_usd_rate, now(), auth.uid())
    on conflict (id) do update set tx_usd_rate = excluded.tx_usd_rate, updated_at = excluded.updated_at, updated_by = excluded.updated_by;
  return query select r.tx_usd_rate, r.updated_at from public.tx_exchange_rates r where r.id = true;
end;
$$;

revoke all on function public.admin_get_tx_exchange_rate() from public;
revoke all on function public.admin_set_tx_exchange_rate(numeric) from public;
grant execute on function public.admin_get_tx_exchange_rate() to authenticated;
grant execute on function public.admin_set_tx_exchange_rate(numeric) to authenticated;

alter table public.donations add column if not exists tx_usd_rate numeric check (tx_usd_rate > 0);
alter table public.donations add column if not exists amount_usd numeric check (amount_usd > 0);
