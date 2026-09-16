alter table public.projects add column if not exists chain_registration_tx_hash text;

create or replace function public.admin_resolve_project(target_project_id uuid, next_status text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_soundfaith_admin() then raise exception 'Admin access required'; end if;
  if next_status not in ('active', 'closed') then raise exception 'Admin can only publish or close projects'; end if;
  update public.projects
  set status = case when next_status = 'active' then 'approved_pending_chain' else 'closed' end,
      attestation_status = case when next_status = 'active' then 'active' else 'rejected' end
  where id = target_project_id and status = 'review';
  if not found then raise exception 'Project is not awaiting admin moderation'; end if;
  update public.review_rounds
  set status = case when next_status = 'active' then 'approved' else 'rejected' end,
      closed_at = now()
  where project_id = target_project_id and status = 'open';
end;
$$;

drop function if exists public.relayer_activate_project(uuid);
create or replace function public.relayer_activate_project(
  target_project_id uuid,
  next_chain_project_id text,
  next_transaction_hash text
)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if next_chain_project_id is null or next_chain_project_id <> 'soundfaith:' || target_project_id::text then
    raise exception 'Invalid chain project ID';
  end if;
  update public.projects
  set status = 'active',
      chain_project_id = next_chain_project_id,
      chain_registration_tx_hash = nullif(next_transaction_hash, '')
  where id = target_project_id and status = 'approved_pending_chain';
  if not found then raise exception 'Project is not awaiting chain registration'; end if;
end;
$$;

create or replace function public.admin_override_attestation(target_project_id uuid, next_status text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_soundfaith_admin() then raise exception 'Admin access required'; end if;
  if next_status not in ('active', 'rejected') then raise exception 'Invalid attestation override'; end if;
  update public.projects
  set status = case when next_status = 'active' then 'approved_pending_chain' else 'closed' end,
      attestation_status = next_status
  where id = target_project_id;
end;
$$;

revoke all on function public.admin_resolve_project(uuid, text) from public;
grant execute on function public.admin_resolve_project(uuid, text) to authenticated;
revoke all on function public.relayer_activate_project(uuid, text, text) from public;
grant execute on function public.relayer_activate_project(uuid, text, text) to service_role;
revoke all on function public.admin_override_attestation(uuid, text) from public;
grant execute on function public.admin_override_attestation(uuid, text) to authenticated;