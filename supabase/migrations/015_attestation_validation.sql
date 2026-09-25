-- Privacy-preserving compliance and project attestation state.
-- Only the external provider id and decision fields are retained; no PII or documents.
create table if not exists public.identity_verifications (
  user_id uuid primary key references auth.users(id) on delete cascade,
  wallet_address text not null unique,
  externaluserid text not null unique,
  kyc_status text not null check (kyc_status in ('pending', 'approved', 'rejected')),
  applicant_type text not null default 'unknown' check (applicant_type in ('unknown', 'individual', 'company')),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_attestations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  reviewer_wallet text not null,
  decision text not null check (decision in ('attest', 'flag')),
  reputation integer not null default 1,
  created_at timestamptz not null default now(),
  unique (project_id, reviewer_wallet)
);

alter table public.projects add column if not exists required_attestations integer not null default 5;
alter table public.projects add column if not exists required_weighted_score integer not null default 20;
alter table public.projects add column if not exists attestation_status text not null default 'pending' check (attestation_status in ('pending', 'active', 'paused', 'rejected'));
alter table public.reviewers add column if not exists reputation integer not null default 1 check (reputation >= 0);

alter table public.identity_verifications enable row level security;
alter table public.project_attestations enable row level security;

create policy "users can read own verification" on public.identity_verifications
  for select using (user_id = auth.uid());
create policy "public can read project attestations" on public.project_attestations
  for select using (true);

create or replace function public.required_project_attestations(goal numeric)
returns integer
language sql immutable
as $$ select least(5 + floor(goal / 10000)::integer, 30); $$;

create or replace function public.prepare_project_attestation()
returns trigger
language plpgsql
as $$
begin
  new.required_attestations := public.required_project_attestations(new.goal_tx);
  new.required_weighted_score := new.required_attestations * 4;
  new.attestation_status := 'pending';
  if new.status = 'active' then new.attestation_status := 'active'; end if;
  return new;
end;
$$;

drop trigger if exists project_attestation_defaults on public.projects;
create trigger project_attestation_defaults before insert or update of goal_tx, status on public.projects
for each row execute function public.prepare_project_attestation();

create or replace function public.require_project_kyb()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
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

drop trigger if exists project_kyb_required on public.projects;
create trigger project_kyb_required before insert on public.projects
for each row execute function public.require_project_kyb();

create or replace function public.submit_project_attestation(target_project_id uuid, next_decision text)
returns void
language plpgsql security definer set search_path = public
as $$
declare wallet text; rep integer;
begin
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

create or replace function public.admin_override_attestation(target_project_id uuid, next_status text)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_soundfaith_admin() then raise exception 'Admin access required'; end if;
  if next_status not in ('active', 'rejected') then raise exception 'Invalid attestation override'; end if;
  update public.projects set status = next_status, attestation_status = next_status where id = target_project_id;
end;
$$;

revoke all on function public.submit_project_attestation(uuid, text) from public;
revoke all on function public.admin_override_attestation(uuid, text) from public;
grant execute on function public.submit_project_attestation(uuid, text) to authenticated;
grant execute on function public.admin_override_attestation(uuid, text) to authenticated;