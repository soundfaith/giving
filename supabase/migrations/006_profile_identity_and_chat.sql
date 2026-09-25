-- Migration for the privacy-first identity model and project chat.

alter table public.profiles
  add column if not exists handle text;

create unique index if not exists profiles_handle_idx
  on public.profiles (handle)
  where handle is not null;

create table if not exists public.profile_wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  wallet_address text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.project_comments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  author_handle text,
  message text not null,
  profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.project_comments
  add column if not exists author_handle text;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'project_comments'
      and column_name = 'author_name'
  ) then
    execute $migration$
      update public.project_comments
      set author_handle = author_name
      where author_handle is null and author_name is not null
    $migration$;
  end if;
end
$$;

drop policy if exists "authenticated users can post project comments" on public.project_comments;

alter table public.project_comments
  alter column author_handle set data type text;

alter table public.project_comments
  drop column if exists author_name;

update public.project_comments
set author_handle = 'community-supporter'
where author_handle is null or length(trim(author_handle)) = 0;

alter table public.project_comments
  drop constraint if exists project_comments_author_handle_check;

alter table public.project_comments
  add constraint project_comments_author_handle_check
  check (author_handle is not null and length(trim(author_handle)) > 0)
  not valid;

alter table public.project_comments validate constraint project_comments_author_handle_check;

alter table public.profiles enable row level security;
alter table public.profile_wallets enable row level security;
alter table public.project_comments enable row level security;

drop policy if exists "users can read their own profile" on public.profiles;
drop policy if exists "users can insert their own profile" on public.profiles;
drop policy if exists "users can update their own profile" on public.profiles;
drop policy if exists "users can read their own wallet map" on public.profile_wallets;
drop policy if exists "users can upsert their own wallet map" on public.profile_wallets;
drop policy if exists "users can update their own wallet map" on public.profile_wallets;
drop policy if exists "project comments are readable by everyone" on public.project_comments;
drop policy if exists "authenticated users can post project comments" on public.project_comments;

create policy "users can read their own profile" on public.profiles
  for select using (auth.uid() = id);

create policy "users can insert their own profile" on public.profiles
  for insert with check (auth.uid() = id);

create policy "users can update their own profile" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

create policy "users can read their own wallet map" on public.profile_wallets
  for select using (auth.uid() = user_id);

create policy "users can upsert their own wallet map" on public.profile_wallets
  for insert with check (auth.uid() = user_id);

create policy "users can update their own wallet map" on public.profile_wallets
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "project comments are readable by everyone" on public.project_comments
  for select using (true);

create policy "authenticated users can post project comments" on public.project_comments
  for insert with check (
    author_handle is not null
    and length(trim(author_handle)) > 0
    and length(trim(message)) > 0
    and project_id is not null
  );
