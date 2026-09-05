create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  provider text check (provider in ('google', 'email', 'apple')),
  wallet_address text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.donations add column if not exists profile_id uuid references public.profiles(id);
create index if not exists donations_profile_id_idx on public.donations(profile_id);

alter table public.profiles enable row level security;

drop policy if exists "users can read their own profile" on public.profiles;
create policy "users can read their own profile" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "users can insert their own profile" on public.profiles;
create policy "users can insert their own profile" on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists "users can update their own profile" on public.profiles;
create policy "users can update their own profile" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

create or replace view public.project_totals as
select
  p.id,
  coalesce(sum(d.amount_tx), 0) as raised_tx,
  count(d.id)::int as donor_count
from public.projects p
left join public.donations d on d.project_id = p.id
where p.status = 'active'
group by p.id;

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
alter table public.projects drop constraint if exists projects_status_check;
alter table public.projects add constraint projects_status_check check (status in ('draft', 'review', 'approved_pending_chain', 'active', 'funded', 'closed'));
alter table public.church_organizations enable row level security;

drop policy if exists "church owners can read organizations" on public.church_organizations;
create policy "church owners can read organizations" on public.church_organizations for select using (owner_id = auth.uid());
drop policy if exists "users can create organizations" on public.church_organizations;
create policy "users can create organizations" on public.church_organizations for insert with check (owner_id = auth.uid());
drop policy if exists "church owners can create projects" on public.projects;
create policy "church owners can create projects" on public.projects for insert with check (submitted_by = auth.uid());
drop policy if exists "church owners can update draft projects" on public.projects;
create policy "church owners can update draft projects" on public.projects for update using (submitted_by = auth.uid() and status in ('draft', 'review')) with check (submitted_by = auth.uid());

insert into storage.buckets (id, name, public)
values ('project-photos', 'project-photos', false)
on conflict (id) do nothing;

drop policy if exists "church owners upload project photos" on storage.objects;
create policy "church owners upload project photos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'project-photos' and (storage.foldername(name))[1] in (
    select id::text from public.projects where submitted_by = auth.uid()
  ));

drop policy if exists "church owners read project photos" on storage.objects;
create policy "church owners read project photos" on storage.objects
  for select to authenticated
  using (bucket_id = 'project-photos' and (storage.foldername(name))[1] in (
    select id::text from public.projects where submitted_by = auth.uid()
  ));
