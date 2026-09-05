-- Let donors and project owners read indexed donation history.

drop policy if exists "donors can read their own donations" on public.donations;

create policy "donors and project owners can read donations" on public.donations
  for select using (
    profile_id = auth.uid()
    or exists (
      select 1
      from public.projects p
      where p.id = donations.project_id
        and p.submitted_by = auth.uid()
    )
  );