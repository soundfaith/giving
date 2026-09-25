-- Destructive MVP reset. Preserve admin registry rows and their profiles.
do $$
declare
  keep_user_ids uuid[];
begin
  select coalesce(array_agg(p.id), '{}'::uuid[])
    into keep_user_ids
  from public.profiles p
  where lower(coalesce(p.email, '')) = 'soundfaith.core@gmail.com'
     or exists (
       select 1
       from public.admin_wallets a
       where a.active = true
         and a.email is not null
         and lower(a.email) = lower(p.email)
     );

  delete from public.notifications;
  delete from public.project_reviews;
  delete from public.review_rounds;
  delete from public.donations;
  delete from public.project_comments;
  delete from public.projects;
  delete from public.church_organizations;
  delete from public.reviewers;
  delete from public.identities;
  delete from public.profile_wallets where user_id <> all(keep_user_ids);
  delete from public.profiles where id <> all(keep_user_ids);

  delete from public.indexer_state;
  insert into public.indexer_state (id, last_height)
  values ('coreum-testnet-donations', 0)
  on conflict (id) do update set last_height = 0, updated_at = now();
end;
$$;

delete from auth.users
where id not in (select id from public.profiles);
