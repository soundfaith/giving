-- Keep the Supabase UUID separate from the namespaced protocol project id.
alter table public.projects
  add column if not exists chain_project_id text;

create unique index if not exists projects_chain_project_id_idx
  on public.projects (chain_project_id)
  where chain_project_id is not null;