-- Persist the wallet that owns a project independently of the login identity.

alter table public.projects
  add column if not exists owner_wallet_address text;

create index if not exists projects_owner_wallet_address_idx
  on public.projects (owner_wallet_address);

drop function if exists public.admin_list_projects();

create or replace function public.admin_list_projects()
returns table (id uuid, title text, church_name text, location text, status text, goal_tx numeric, submitted_by uuid, owner_wallet_address text, required_reviews integer, approval_threshold integer, rejection_threshold integer, approvals bigint, rejections bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_soundfaith_admin() then raise exception 'Admin access required'; end if;
  return query
    select p.id, p.title, p.church_name, p.location, p.status, p.goal_tx, p.submitted_by, p.owner_wallet_address,
      coalesce(rr.required_reviews, 3), coalesce(rr.approval_threshold, 3), coalesce(rr.rejection_threshold, 3),
      count(pr.*) filter (where pr.decision = 'approve'), count(pr.*) filter (where pr.decision = 'reject')
    from public.projects p
    left join public.review_rounds rr on rr.project_id = p.id
    left join public.project_reviews pr on pr.project_id = p.id
    group by p.id, rr.required_reviews, rr.approval_threshold, rr.rejection_threshold
    order by case when p.status = 'review' then 0 else 1 end, p.created_at desc;
end;
$$;
