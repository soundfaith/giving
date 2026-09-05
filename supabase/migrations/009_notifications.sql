-- User-facing events for project owners and donors.

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('project_status', 'donation_received', 'donation_sent', 'claim_ready', 'claim_released')),
  project_id uuid references public.projects(id) on delete cascade,
  donation_id uuid references public.donations(id) on delete set null,
  title text not null,
  message text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

drop policy if exists "users can read their notifications" on public.notifications;
drop policy if exists "users can mark their notifications read" on public.notifications;

create policy "users can read their notifications" on public.notifications
  for select using (auth.uid() = user_id);

create policy "users can mark their notifications read" on public.notifications
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.notify_project_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.submitted_by is not null and old.status is distinct from new.status then
    insert into public.notifications (user_id, kind, project_id, title, message)
    values (
      new.submitted_by,
      'project_status',
      new.id,
      'Project status changed',
      format('%s is now %s.', new.title, new.status)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists project_status_notification on public.projects;
create trigger project_status_notification
after update of status on public.projects
for each row execute function public.notify_project_status_change();

create or replace function public.notify_donation_received()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare project_owner uuid; project_title text;
begin
  select submitted_by, title into project_owner, project_title
  from public.projects where id = new.project_id;
  if project_owner is not null then
    insert into public.notifications (user_id, kind, project_id, donation_id, title, message)
    values (project_owner, 'donation_received', new.project_id, new.id, 'New donation received', format('%s received a donation of %s TX.', project_title, new.amount_tx));
  end if;
  if new.profile_id is not null then
    insert into public.notifications (user_id, kind, project_id, donation_id, title, message)
    values (new.profile_id, 'donation_sent', new.project_id, new.id, 'Donation recorded', format('Your donation of %s TX was recorded for %s.', new.amount_tx, project_title));
  end if;
  return new;
end;
$$;

drop trigger if exists donation_notification on public.donations;
create trigger donation_notification
after insert on public.donations
for each row execute function public.notify_donation_received();
