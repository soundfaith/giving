-- The admin identity is the authenticated email, independent of its linked wallet.
create or replace function public.is_soundfaith_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select lower(coalesce(p.email, auth.jwt() ->> 'email')) = 'soundfaith.core@gmail.com'
  from public.profiles p
  where p.id = auth.uid();
$$;

revoke all on function public.is_soundfaith_admin() from public;
grant execute on function public.is_soundfaith_admin() to authenticated;