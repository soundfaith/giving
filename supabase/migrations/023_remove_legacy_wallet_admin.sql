-- Remove wallet-only admin entries now that authorization is email-based.
delete from public.admin_wallets
where email is null;

insert into public.admin_wallets (wallet_address, email, label, active)
values ('email:soundfaith.core@gmail.com', 'soundfaith.core@gmail.com', 'SoundFaith admin', true)
on conflict (wallet_address) do update
  set email = excluded.email, label = excluded.label, active = true;
