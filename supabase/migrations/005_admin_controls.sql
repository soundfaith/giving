-- MVP admin controls. This wallet is the initial admin; replace or add rows
-- before deployment. All admin writes go through SECURITY DEFINER functions
-- that verify the signed-in user's profile wallet address.
create table if not exists public.admin_wallets (
  wallet_address text primary key,
  label text not null default 'MVP admin',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.admin_wallets (wallet_address, label)
values ('testcore1hzt8gdqgvhxut95sn4cy9c2xh0t9m2uamwy726', 'MVP admin')
on conflict (wallet_address) do update set active = true;

alter table public.review_rounds add column if not exists approval_threshold integer not null default 3 check (approval_threshold >= 1);
alter table public.review_rounds add column if not exists rejection_threshold integer not null default 3 check (rejection_threshold >= 1);
update public.review_rounds set approval_threshold = required_reviews, rejection_threshold = required_reviews where approval_threshold is null or rejection_threshold is null;

create or replace function public.is_soundfaith_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_wallets a
    join public.profiles p on p.wallet_address = a.wallet_address
    where p.id = auth.uid() and a.active = true
  );
$$;

revoke all on function public.is_soundfaith_admin() from public;
grant execute on function public.is_soundfaith_admin() to authenticated;

create or replace function public.admin_list_reviewers()
returns table (profile_id uuid, email text, wallet_address text, status text, expertise text[], created_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_soundfaith_admin() then raise exception 'Admin access required'; end if;
  return query select r.profile_id, p.email, r.wallet_address, r.status, r.expertise, r.created_at
    from public.reviewers r join public.profiles p on p.id = r.profile_id order by r.created_at desc;
end;
$$;

drop function if exists public.admin_list_projects();

create or replace function public.admin_list_projects()
returns table (id uuid, title text, church_name text, location text, status text, goal_tx numeric, submitted_by uuid, required_reviews integer, approval_threshold integer, rejection_threshold integer, approvals bigint, rejections bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_soundfaith_admin() then raise exception 'Admin access required'; end if;
  return query
    select p.id, p.title, p.church_name, p.location, p.status, p.goal_tx, p.submitted_by,
      coalesce(rr.required_reviews, 3), coalesce(rr.approval_threshold, 3), coalesce(rr.rejection_threshold, 3),
      count(pr.*) filter (where pr.decision = 'approve'), count(pr.*) filter (where pr.decision = 'reject')
    from public.projects p
    left join public.review_rounds rr on rr.project_id = p.id
    left join public.project_reviews pr on pr.project_id = p.id
    group by p.id, rr.required_reviews, rr.approval_threshold, rr.rejection_threshold
    order by case when p.status = 'review' then 0 else 1 end, p.created_at desc;
end;
$$;

create or replace function public.admin_set_reviewer_status(target_profile_id uuid, next_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_soundfaith_admin() then raise exception 'Admin access required'; end if;
  if next_status not in ('pending', 'active', 'suspended') then raise exception 'Invalid reviewer status'; end if;
  update public.reviewers set status = next_status where profile_id = target_profile_id;
  if not found then raise exception 'Reviewer application not found'; end if;
end;
$$;

create or replace function public.admin_set_review_thresholds(target_project_id uuid, next_approval_threshold integer, next_rejection_threshold integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_soundfaith_admin() then raise exception 'Admin access required'; end if;
  if next_approval_threshold < 1 or next_rejection_threshold < 1 then raise exception 'Thresholds must be at least 1'; end if;
  insert into public.review_rounds (project_id, approval_threshold, rejection_threshold)
    values (target_project_id, next_approval_threshold, next_rejection_threshold)
    on conflict (project_id) do update set approval_threshold = excluded.approval_threshold, rejection_threshold = excluded.rejection_threshold;
end;
$$;

create or replace function public.admin_resolve_project(target_project_id uuid, next_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_soundfaith_admin() then raise exception 'Admin access required'; end if;
  if next_status not in ('active', 'closed') then raise exception 'Admin can only publish or close projects'; end if;
  update public.projects set status = next_status where id = target_project_id and status = 'review';
  if not found then raise exception 'Project is not awaiting review'; end if;
  update public.review_rounds set status = case when next_status = 'active' then 'approved' else 'rejected' end, closed_at = now() where project_id = target_project_id and status = 'open';
end;
$$;

revoke all on function public.admin_list_reviewers() from public;
revoke all on function public.admin_list_projects() from public;
revoke all on function public.admin_set_reviewer_status(uuid, text) from public;
revoke all on function public.admin_set_review_thresholds(uuid, integer, integer) from public;
revoke all on function public.admin_resolve_project(uuid, text) from public;
grant execute on function public.admin_list_reviewers() to authenticated;
grant execute on function public.admin_list_projects() to authenticated;
grant execute on function public.admin_set_reviewer_status(uuid, text) to authenticated;
grant execute on function public.admin_set_review_thresholds(uuid, integer, integer) to authenticated;
grant execute on function public.admin_resolve_project(uuid, text) to authenticated;

create or replace function public.resolve_project_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare approvals integer; rejections integer; approval_limit integer; rejection_limit integer;
begin
  select approval_threshold, rejection_threshold into approval_limit, rejection_limit from public.review_rounds where project_id = new.project_id and status = 'open';
  if approval_limit is null then return new; end if;
  select count(*) filter (where decision = 'approve'), count(*) filter (where decision = 'reject') into approvals, rejections from public.project_reviews where project_id = new.project_id;
  if approvals >= approval_limit then
    update public.projects set status = 'active' where id = new.project_id and status = 'review';
    update public.review_rounds set status = 'approved', closed_at = now() where project_id = new.project_id and status = 'open';
  elsif rejections >= rejection_limit then
    update public.projects set status = 'closed' where id = new.project_id and status = 'review';
    update public.review_rounds set status = 'rejected', closed_at = now() where project_id = new.project_id and status = 'open';
  end if;
  return new;
end;
$$;
