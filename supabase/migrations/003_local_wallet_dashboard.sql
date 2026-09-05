-- The browser-owned wallet is the signing identity. Supabase stores only the
-- authenticated email and its associated public Coreum address.
alter table public.profiles drop column if exists provider;
alter table public.identities drop column if exists provider;

-- Keep this migration runnable on databases created from the original schema,
-- where the church workflow columns do not exist yet.
create table if not exists public.church_organizations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  verification_status text not null default 'pending' check (verification_status in ('pending', 'verified', 'rejected')),
  created_at timestamptz not null default now()
);

alter table public.projects add column if not exists organization_id uuid references public.church_organizations(id);
alter table public.projects add column if not exists submitted_by uuid references auth.users(id);
alter table public.projects add column if not exists moderation_note text;
alter table public.donations add column if not exists profile_id uuid references public.profiles(id);
create index if not exists donations_profile_id_idx on public.donations(profile_id);

-- Older databases may still have a draft-only status constraint. Replace it
-- before the submission flow inserts projects with status = 'review'.
alter table public.projects drop constraint if exists projects_status_check;
alter table public.projects add constraint projects_status_check
  check (status in ('draft', 'review', 'approved_pending_chain', 'active', 'funded', 'closed'));

alter table public.projects enable row level security;
alter table public.church_organizations enable row level security;
drop policy if exists "church owners can read organizations" on public.church_organizations;
create policy "church owners can read organizations" on public.church_organizations
  for select using (owner_id = auth.uid());
drop policy if exists "users can create organizations" on public.church_organizations;
create policy "users can create organizations" on public.church_organizations
  for insert with check (owner_id = auth.uid());
drop policy if exists "church owners can create projects" on public.projects;
create policy "church owners can create projects" on public.projects
  for insert with check (submitted_by = auth.uid());
drop policy if exists "owners can read their submitted projects" on public.projects;
create policy "owners can read their submitted projects" on public.projects
  for select using (submitted_by = auth.uid());

alter table public.donations enable row level security;
drop policy if exists "donors can read their own donations" on public.donations;
create policy "donors can read their own donations" on public.donations
  for select using (profile_id = auth.uid());
