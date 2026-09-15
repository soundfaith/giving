-- Authenticated donors may record a confirmed chain transaction immediately.
-- The relayer remains responsible for catch-up and reconciliation.
drop policy if exists "authenticated donors can record confirmed donations" on public.donations;
create policy "authenticated donors can record confirmed donations" on public.donations
  for insert to authenticated
  with check (
    tx_hash is not null
    and (
      exists (
        select 1 from public.profiles p
        where p.id = auth.uid() and p.wallet_address = donations.wallet_address
      )
      or exists (
        select 1 from public.profile_wallets w
        where w.user_id = auth.uid() and w.wallet_address = donations.wallet_address
      )
    )
  );