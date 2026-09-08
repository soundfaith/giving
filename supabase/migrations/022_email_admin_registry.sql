-- Keep the legacy table name for compatibility, but authorize admins by email.
alter table public.admin_wallets
  add column if not exists email text;

insert into public.admin_wallets (wallet_address, email, label, active)
values ('email:soundfaith.core@gmail.com', 'soundfaith.core@gmail.com', 'SoundFaith admin', true)
on conflict (wallet_address) do update
  set email = excluded.email, label = excluded.label, active = true;

create or replace function public.is_soundfaith_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_wallets a
    join public.profiles p on lower(p.email) = lower(a.email)
    where p.id = auth.uid()
      and a.email is not null
      and a.active = true
  )
  or lower(coalesce(auth.jwt() ->> 'email', '')) = 'soundfaith.core@gmail.com';
$$;

revoke all on function public.is_soundfaith_admin() from public;
grant execute on function public.is_soundfaith_admin() to authenticated;