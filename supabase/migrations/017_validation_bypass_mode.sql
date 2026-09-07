-- Keep TX KYC and attestation code deployed, but allow the current admin moderation flow
-- while the TX Marketplace identity service is unavailable.
create table if not exists public.validation_settings (
  id boolean primary key default true check (id = true),
  kyc_enforcement_enabled boolean not null default false,
  attestation_enforcement_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into public.validation_settings (id, kyc_enforcement_enabled, attestation_enforcement_enabled)
values (true, false, false)
on conflict (id) do nothing;

alter table public.validation_settings enable row level security;

create or replace function public.require_project_kyb()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if not coalesce((select kyc_enforcement_enabled from public.validation_settings where id = true), false) then
    return new;
  end if;
  if not exists (
    select 1 from public.identity_verifications v
    where v.user_id = new.submitted_by
      and v.wallet_address = new.owner_wallet_address
      and v.kyc_status = 'approved'
      and v.applicant_type = 'company'
  ) then
    raise exception 'Project owner requires an approved KYB company wallet';
  end if;
  return new;
end;
$$;

create or replace function public.submit_project_attestation(target_project_id uuid, next_decision text)
returns void
language plpgsql security definer set search_path = public
as $$
declare wallet text; rep integer;
begin
  if not coalesce((select attestation_enforcement_enabled from public.validation_settings where id = true), false) then
    raise exception 'Attestation enforcement is disabled; use admin moderation';
  end if;
  select p.wallet_address, r.reputation into wallet, rep
  from public.profiles p join public.reviewers r on r.profile_id = p.id
  join public.identity_verifications v on v.user_id = p.id
  where p.id = auth.uid() and r.status = 'active' and v.kyc_status = 'approved' and v.applicant_type = 'individual';
  if wallet is null then raise exception 'Reviewer requires an approved KYC individual wallet'; end if;
  if next_decision not in ('attest', 'flag') then raise exception 'Invalid attestation decision'; end if;
  insert into public.project_attestations(project_id, reviewer_wallet, decision, reputation)
  values (target_project_id, wallet, next_decision, greatest(coalesce(rep, 1), 0));
  update public.projects p set attestation_status = case when next_decision = 'flag' then 'paused' else p.attestation_status end,
    status = case when next_decision = 'flag' then 'review' else p.status end
  where p.id = target_project_id and p.attestation_status in ('pending', 'paused');
end;
$$;

create or replace function public.admin_set_validation_mode(next_kyc boolean, next_attestation boolean)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_soundfaith_admin() then raise exception 'Admin access required'; end if;
  update public.validation_settings
  set kyc_enforcement_enabled = next_kyc,
      attestation_enforcement_enabled = next_attestation,
      updated_at = now()
  where id = true;
end;
$$;

create or replace function public.admin_resolve_project(target_project_id uuid, next_status text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_soundfaith_admin() then raise exception 'Admin access required'; end if;
  if next_status not in ('active', 'closed') then raise exception 'Admin can only publish or close projects'; end if;
  update public.projects
  set status = next_status,
      attestation_status = case when next_status = 'active' then 'active' else 'rejected' end
  where id = target_project_id and status in ('review', 'approved_pending_chain');
  if not found then raise exception 'Project is not awaiting admin moderation'; end if;
  update public.review_rounds
  set status = case when next_status = 'active' then 'approved' else 'rejected' end,
      closed_at = now()
  where project_id = target_project_id and status = 'open';
end;
$$;

revoke all on function public.admin_set_validation_mode(boolean, boolean) from public;
grant execute on function public.admin_set_validation_mode(boolean, boolean) to authenticated;
revoke all on function public.admin_resolve_project(uuid, text) from public;
grant execute on function public.admin_resolve_project(uuid, text) to authenticated;
