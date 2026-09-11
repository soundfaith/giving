create table if not exists public.identities (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  wallet_address text unique not null,
  provider text not null check (provider in ('google', 'apple', 'email')),
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  provider text check (provider in ('google', 'email', 'apple')),
  wallet_address text unique,
  handle text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profile_wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  wallet_address text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  church_name text not null,
  location text not null,
  country text not null default 'United States',
  title text not null,
  description text not null,
  category text not null check (category in ('Sound & AV', 'Worship & Gathering', 'Facilities & Maintenance', 'Community & Outreach', 'General Church Needs')),
  goal_tx numeric not null check (goal_tx > 0),
  metadata_token_id text not null,
  image_urls text[] not null default '{}',
  status text not null default 'draft' check (status in ('draft', 'review', 'approved_pending_chain', 'active', 'funded', 'closed')),
  created_at timestamptz not null default now()
);

create table if not exists public.tx_exchange_rates (
  id boolean primary key default true check (id),
  tx_usd_rate numeric not null default 1 check (tx_usd_rate > 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

insert into public.tx_exchange_rates (id, tx_usd_rate)
values (true, 1)
on conflict (id) do nothing;

alter table public.tx_exchange_rates enable row level security;
create policy "anyone can read the current TX rate" on public.tx_exchange_rates
  for select using (true);
grant select on public.tx_exchange_rates to anon, authenticated;

create table if not exists public.church_organizations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  verification_status text not null default 'pending' check (verification_status in ('pending', 'verified', 'rejected')),
  created_at timestamptz not null default now()
);

alter table public.projects add column if not exists organization_id uuid references public.church_organizations(id);
alter table public.projects add column if not exists submitted_by uuid references auth.users(id);
alter table public.projects add column if not exists owner_wallet_address text;
alter table public.projects add column if not exists moderation_note text;

create table if not exists public.donations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id),
  identity_id uuid references public.identities(id),
  wallet_address text not null,
  amount_tx numeric not null check (amount_tx > 0),
  tx_usd_rate numeric check (tx_usd_rate > 0),
  amount_usd numeric check (amount_usd > 0),
  tx_hash text unique not null,
  network text not null default 'coreum-testnet',
  created_at timestamptz not null default now()
);

create table if not exists public.project_comments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  author_handle text not null,
  message text not null,
  profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.project_likes (
  project_id uuid not null references public.projects(id) on delete cascade,
  profile_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (project_id, profile_id)
);

create table if not exists public.project_shares (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  profile_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.indexer_state (
  id text primary key,
  last_height bigint not null default 0,
  updated_at timestamptz not null default now()
);

insert into public.indexer_state (id, last_height)
values ('coreum-testnet-donations', 0)
on conflict (id) do nothing;

create index if not exists donations_project_id_idx on public.donations(project_id);
create index if not exists donations_wallet_address_idx on public.donations(wallet_address);

create or replace view public.project_donation_history as
select id, project_id, amount_tx, tx_usd_rate, amount_usd, tx_hash, network, created_at
from public.donations;
grant select on public.project_donation_history to anon, authenticated;

alter table public.identities enable row level security;
alter table public.profiles enable row level security;
alter table public.profile_wallets enable row level security;
alter table public.projects enable row level security;
alter table public.church_organizations enable row level security;
alter table public.donations enable row level security;
alter table public.project_comments enable row level security;
alter table public.project_likes enable row level security;
alter table public.project_shares enable row level security;
alter table public.indexer_state enable row level security;

create policy "public can read public project statuses" on public.projects
  for select using (status in ('active', 'funded', 'closed'));

create policy "church owners can read organizations" on public.church_organizations
  for select using (owner_id = auth.uid());

create policy "users can create organizations" on public.church_organizations
  for insert with check (owner_id = auth.uid());

create policy "church owners can create projects" on public.projects
  for insert with check (submitted_by = auth.uid());

create policy "church owners can update draft projects" on public.projects
  for update using (submitted_by = auth.uid() and status in ('draft', 'review'))
  with check (submitted_by = auth.uid());

insert into storage.buckets (id, name, public)
values ('project-photos', 'project-photos', true)
on conflict (id) do update set public = true;

create policy "church owners upload project photos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'project-photos' and (storage.foldername(name))[1] in (
    select id::text from public.projects where submitted_by = auth.uid()
  ));

create policy "public can read project photos" on storage.objects
  for select using (bucket_id = 'project-photos');

create policy "users can read their own profile" on public.profiles
  for select using (auth.uid() = id);

create policy "users can insert their own profile" on public.profiles
  for insert with check (auth.uid() = id);

create policy "users can update their own profile" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

create policy "users can read their own wallet map" on public.profile_wallets
  for select using (auth.uid() = user_id);

create policy "users can upsert their own wallet map" on public.profile_wallets
  for insert with check (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users can update their own wallet map" on public.profile_wallets
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "project comments are readable by everyone" on public.project_comments
  for select using (true);

create policy "anyone can read project like counts" on public.project_likes
  for select using (true);

create policy "users can like projects" on public.project_likes
  for insert to authenticated
  with check (profile_id = auth.uid());

create policy "users can remove their project likes" on public.project_likes
  for delete to authenticated
  using (profile_id = auth.uid());

create policy "anyone can record project shares" on public.project_shares
  for insert
  with check (project_id is not null and (profile_id is null or profile_id = auth.uid()));

create policy "authenticated users can post project comments" on public.project_comments
  for insert with check (
    author_handle is not null
    and length(trim(author_handle)) > 0
    and length(trim(message)) > 0
    and project_id is not null
  );

create policy "donors can read their own donations" on public.donations
  for select using (wallet_address = auth.jwt() ->> 'wallet_address');

create or replace view public.project_totals as
select
  p.id,
  coalesce(sum(d.amount_tx), 0) as raised_tx,
  count(d.id)::int as donor_count
from public.projects p
left join public.donations d on d.project_id = p.id
where p.status in ('active', 'funded', 'closed')
group by p.id;
