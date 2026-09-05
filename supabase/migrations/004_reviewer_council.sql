-- Reviewer council: moderation is performed by an accountable group of
-- wallet-identified reviewers, not by an implicit platform administrator.
create table if not exists public.reviewers (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  wallet_address text not null unique,
  status text not null default 'pending' check (status in ('pending', 'active', 'suspended')),
  expertise text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.review_rounds (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references public.projects(id) on delete cascade,
  required_reviews integer not null default 3 check (required_reviews >= 2),
  status text not null default 'open' check (status in ('open', 'approved', 'rejected')),
  opened_at timestamptz not null default now(),
  closed_at timestamptz
);

create table if not exists public.project_reviews (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id) on delete cascade,
  decision text not null check (decision in ('approve', 'reject')),
  note text,
  created_at timestamptz not null default now(),
  unique (project_id, reviewer_id)
);

create index if not exists project_reviews_project_idx on public.project_reviews(project_id);
create index if not exists reviewers_status_idx on public.reviewers(status);

alter table public.reviewers enable row level security;
alter table public.review_rounds enable row level security;
alter table public.project_reviews enable row level security;

drop policy if exists "users can apply as reviewers" on public.reviewers;
create policy "users can apply as reviewers" on public.reviewers
  for insert with check (profile_id = auth.uid());

drop policy if exists "users can read their reviewer application" on public.reviewers;
create policy "users can read their reviewer application" on public.reviewers
  for select using (profile_id = auth.uid());

drop policy if exists "active reviewers can read rounds" on public.review_rounds;
create policy "active reviewers can read rounds" on public.review_rounds
  for select using (exists (select 1 from public.reviewers r where r.profile_id = auth.uid() and r.status = 'active'));

drop policy if exists "active reviewers can read review projects" on public.projects;
create policy "active reviewers can read review projects" on public.projects
  for select using (exists (select 1 from public.reviewers r where r.profile_id = auth.uid() and r.status = 'active') and status = 'review');

drop policy if exists "active reviewers can read reviews" on public.project_reviews;
create policy "active reviewers can read reviews" on public.project_reviews
  for select using (exists (select 1 from public.reviewers r where r.profile_id = auth.uid() and r.status = 'active'));

drop policy if exists "active reviewers can submit reviews" on public.project_reviews;
create policy "active reviewers can submit reviews" on public.project_reviews
  for insert with check (
    reviewer_id = auth.uid()
    and exists (select 1 from public.reviewers r where r.profile_id = auth.uid() and r.status = 'active')
    and not exists (select 1 from public.projects p where p.id = project_id and p.submitted_by = auth.uid())
  );

create or replace function public.open_project_review_round()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'review' and (tg_op = 'INSERT' or old.status is distinct from 'review') then
    insert into public.review_rounds (project_id)
    values (new.id)
    on conflict (project_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists project_review_round_trigger on public.projects;
create trigger project_review_round_trigger
after insert or update of status on public.projects
for each row execute function public.open_project_review_round();

create or replace function public.resolve_project_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  required_count integer;
  approvals integer;
  rejections integer;
begin
  select required_reviews into required_count from public.review_rounds where project_id = new.project_id and status = 'open';
  if required_count is null then return new; end if;
  select count(*) filter (where decision = 'approve'), count(*) filter (where decision = 'reject')
    into approvals, rejections from public.project_reviews where project_id = new.project_id;
  if approvals >= required_count then
    update public.projects set status = 'active' where id = new.project_id and status = 'review';
    update public.review_rounds set status = 'approved', closed_at = now() where project_id = new.project_id and status = 'open';
  elsif rejections >= required_count then
    update public.projects set status = 'closed' where id = new.project_id and status = 'review';
    update public.review_rounds set status = 'rejected', closed_at = now() where project_id = new.project_id and status = 'open';
  end if;
  return new;
end;
$$;

drop trigger if exists project_review_resolution_trigger on public.project_reviews;
create trigger project_review_resolution_trigger
after insert on public.project_reviews
for each row execute function public.resolve_project_review();

-- Create rounds for projects already submitted before this migration.
insert into public.review_rounds (project_id)
select id from public.projects where status = 'review'
on conflict (project_id) do nothing;
