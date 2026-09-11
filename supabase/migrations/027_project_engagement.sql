-- Track project reactions and sharing without exposing individual engagement records.

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

create index if not exists project_likes_project_id_idx on public.project_likes(project_id);
create index if not exists project_shares_project_id_idx on public.project_shares(project_id);

alter table public.project_likes enable row level security;
alter table public.project_shares enable row level security;

drop policy if exists "anyone can read project like counts" on public.project_likes;
drop policy if exists "users can like projects" on public.project_likes;
drop policy if exists "users can remove their project likes" on public.project_likes;
drop policy if exists "anyone can record project shares" on public.project_shares;

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

create or replace function public.get_project_engagement(project_ids uuid[])
returns table (project_id uuid, like_count bigint, share_count bigint, liked_by_user boolean)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    (select count(*) from public.project_likes l where l.project_id = p.id),
    (select count(*) from public.project_shares s where s.project_id = p.id),
    exists (
      select 1
      from public.project_likes current_like
      where current_like.project_id = p.id
        and current_like.profile_id = auth.uid()
    )
  from public.projects p
  where p.id = any(project_ids);
$$;

grant execute on function public.get_project_engagement(uuid[]) to anon, authenticated;
