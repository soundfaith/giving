-- Destructive demo reset.
-- Keeps only the Supabase profile/auth identity linked to the admin wallet below.
-- This does not alter TX contract state or move on-chain funds.

create table if not exists public.indexer_state (
  id text primary key,
  last_height bigint not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.reviewers (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  wallet_address text not null unique,
  status text not null default 'pending',
  expertise text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.review_rounds (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references public.projects(id) on delete cascade,
  required_reviews integer not null default 3,
  status text not null default 'open',
  opened_at timestamptz not null default now(),
  closed_at timestamptz
);

create table if not exists public.project_reviews (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id) on delete cascade,
  decision text not null,
  note text,
  created_at timestamptz not null default now(),
  unique (project_id, reviewer_id)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  project_id uuid references public.projects(id) on delete cascade,
  donation_id uuid references public.donations(id) on delete set null,
  title text not null,
  message text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

do $$
declare
  keep_wallet constant text := 'testcore1l2xwr64rd7xzkpvsmz7d4xp7xwhw82rzznmjs5';
  keep_user_id uuid;
begin
  select id into keep_user_id
  from public.profiles
  where wallet_address = keep_wallet;

  if keep_user_id is null then
    raise exception 'Admin profile for wallet % was not found; refusing destructive reset', keep_wallet;
  end if;

  delete from public.notifications;
  delete from public.project_reviews;
  delete from public.review_rounds;
  delete from public.donations;
  delete from public.project_comments;
  delete from public.projects;
  delete from public.church_organizations;
  delete from public.reviewers;
  delete from public.identities;
  delete from public.profile_wallets where user_id <> keep_user_id;
  delete from public.profiles where id <> keep_user_id;
  delete from public.admin_wallets where wallet_address <> keep_wallet;
  insert into public.admin_wallets (wallet_address, label, active)
  values (keep_wallet, 'MVP admin', true)
  on conflict (wallet_address) do update set active = true;

  delete from public.indexer_state;
  insert into public.indexer_state (id, last_height)
  values ('coreum-testnet-donations', 0);
end;
$$;

delete from auth.users
where id <> (select id from public.profiles where wallet_address = 'testcore1l2xwr64rd7xzkpvsmz7d4xp7xwhw82rzznmjs5');

-- Supabase forbids direct SQL deletion from storage.objects.
-- Remove project images through the Supabase Storage API or Dashboard after
-- this migration succeeds. The database reset itself is safe to rerun.
