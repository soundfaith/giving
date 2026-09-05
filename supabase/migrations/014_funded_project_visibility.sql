-- Funded projects remain visible so their beneficiary can complete the claim flow.

drop policy if exists "public can read active projects" on public.projects;

create policy "public can read active and funded projects" on public.projects
  for select using (status in ('active', 'funded'));