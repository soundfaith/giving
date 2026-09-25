-- Store country separately so project location displays remain consistent.

alter table public.projects
  add column if not exists country text not null default 'United States';

update public.projects
set country = 'United States'
where country is null or length(trim(country)) = 0;
