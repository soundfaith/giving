-- Destructive MVP reset. Preserve the complete admin_wallets registry and
-- profiles/auth identities linked to active admin wallets.
do $$
declare
  keep_user_ids uuid[];
begin
  select coalesce(array_agg(p.id), '{}'::uuid[])
    into keep_user_ids
  from public.profiles p
  where exists (
    select 1
    from public.admin_wallets a
    where a.active = true
      and a.wallet_address = p.wallet_address
  );

  delete from public.notifications;
  delete from public.project_reviews;
  delete from public.review_rounds;
  delete from public.donations;
  delete from public.project_comments;
  delete from public.project_likes;
  delete from public.project_shares;
  delete from public.projects;
  delete from public.church_organizations;
  delete from public.reviewers;
  delete from public.identities
  where wallet_address not in (select wallet_address from public.admin_wallets);
  delete from public.profile_wallets where user_id <> all(keep_user_ids);
  delete from public.profiles where id <> all(keep_user_ids);
  update public.tx_exchange_rates
  set updated_by = null
  where updated_by is not null
    and updated_by <> all(keep_user_ids);

  delete from public.indexer_state;
  insert into public.indexer_state (id, last_height)
  values ('coreum-testnet-donations', 0);
end;
$$;

delete from auth.users
where id not in (select id from public.profiles);