alter table public.projects drop constraint if exists projects_category_check;
update public.projects set category = 'Worship & Gathering' where category = 'Spaces';
update public.projects set category = 'Facilities & Maintenance' where category = 'Access';
alter table public.projects add constraint projects_category_check
  check (category in ('Sound & AV', 'Worship & Gathering', 'Facilities & Maintenance', 'Community & Outreach', 'General Church Needs'));