-- Separate reviewer/admin approval from contract-owner registration.

alter table public.projects drop constraint if exists projects_status_check;
alter table public.projects add constraint projects_status_check
  check (status in ('draft', 'review', 'approved_pending_chain', 'active', 'funded', 'closed'));

create or replace function public.admin_resolve_project(target_project_id uuid, next_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_soundfaith_admin() then raise exception 'Admin access required'; end if;
  if next_status not in ('active', 'closed') then raise exception 'Admin can only approve or close projects'; end if;
  update public.projects
  set status = case when next_status = 'active' then 'approved_pending_chain' else 'closed' end
  where id = target_project_id and status = 'review';
  if not found then raise exception 'Project is not awaiting review'; end if;
  update public.review_rounds
  set status = case when next_status = 'active' then 'approved' else 'rejected' end,
      closed_at = now()
  where project_id = target_project_id and status = 'open';
end;
$$;

create or replace function public.relayer_activate_project(target_project_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.projects
  set status = 'active'
  where id = target_project_id and status = 'approved_pending_chain';
  if not found then raise exception 'Project is not awaiting chain registration'; end if;
end;
$$;

revoke all on function public.relayer_activate_project(uuid) from public;
grant execute on function public.relayer_activate_project(uuid) to service_role;

create or replace function public.resolve_project_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare approvals integer; rejections integer; approval_limit integer; rejection_limit integer;
begin
  select approval_threshold, rejection_threshold into approval_limit, rejection_limit
  from public.review_rounds where project_id = new.project_id and status = 'open';
  if approval_limit is null then return new; end if;
  select count(*) filter (where decision = 'approve'), count(*) filter (where decision = 'reject')
    into approvals, rejections from public.project_reviews where project_id = new.project_id;
  if approvals >= approval_limit then
    update public.projects set status = 'approved_pending_chain' where id = new.project_id and status = 'review';
    update public.review_rounds set status = 'approved', closed_at = now() where project_id = new.project_id and status = 'open';
  elsif rejections >= rejection_limit then
    update public.projects set status = 'closed' where id = new.project_id and status = 'review';
    update public.review_rounds set status = 'rejected', closed_at = now() where project_id = new.project_id and status = 'open';
  end if;
  return new;
end;
$$;
