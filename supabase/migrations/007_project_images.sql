-- Make approved project photos renderable and persist their public URLs.

update storage.buckets
set public = true
where id = 'project-photos';

insert into storage.buckets (id, name, public)
values ('project-photos', 'project-photos', true)
on conflict (id) do update set public = true;

drop policy if exists "church owners read project photos" on storage.objects;
drop policy if exists "public can read project photos" on storage.objects;

create policy "public can read project photos" on storage.objects
  for select using (bucket_id = 'project-photos');
