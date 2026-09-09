-- Associate already-indexed donations with browser-owned wallets.
update public.donations d
set profile_id = coalesce(d.profile_id, p.id, pw.user_id)
from public.profiles p
full join public.profile_wallets pw on pw.user_id = p.id
where d.profile_id is null
  and (p.wallet_address = d.wallet_address or pw.wallet_address = d.wallet_address);