-- Project visitors need to see indexed donation history on public project pages.
drop policy if exists "donors and project owners can read donations" on public.donations;
drop policy if exists "public can read project donations" on public.donations;

create policy "public can read project donations" on public.donations
  for select using (
    exists (
      select 1
      from public.projects p
      where p.id = donations.project_id
        and p.status in ('active', 'funded')
    )
  );