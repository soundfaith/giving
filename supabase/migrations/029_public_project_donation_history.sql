-- Expose project donation history without exposing donor identity or wallet addresses.

create or replace view public.project_donation_history as
select
  id,
  project_id,
  amount_tx,
  tx_usd_rate,
  amount_usd,
  tx_hash,
  network,
  created_at
from public.donations;

grant select on public.project_donation_history to anon, authenticated;
