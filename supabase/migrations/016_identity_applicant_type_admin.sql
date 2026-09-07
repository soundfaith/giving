create or replace function public.admin_set_identity_applicant_type(target_user_id uuid, next_type text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_soundfaith_admin() then raise exception 'Admin access required'; end if;
  if next_type not in ('individual', 'company', 'unknown') then raise exception 'Invalid applicant type'; end if;
  update public.identity_verifications
  set applicant_type = next_type, updated_at = now()
  where user_id = target_user_id;
  if not found then raise exception 'Identity verification not found'; end if;
end;
$$;

revoke all on function public.admin_set_identity_applicant_type(uuid, text) from public;
grant execute on function public.admin_set_identity_applicant_type(uuid, text) to authenticated;