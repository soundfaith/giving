-- Allow a donation intent to exist before the relayer attaches its chain hash.
alter table public.donations
  alter column tx_hash drop not null;

drop view if exists public.project_donation_history;
create view public.project_donation_history as
select id, project_id, amount_tx, tx_usd_rate, amount_usd, tx_hash, network, created_at
from public.donations;
grant select on public.project_donation_history to anon, authenticated;

drop view if exists public.project_totals;
create view public.project_totals as
select
  p.id,
  coalesce(sum(d.amount_tx) filter (where d.tx_hash is not null), 0) as raised_tx,
  count(d.id) filter (where d.tx_hash is not null)::int as donor_count
from public.projects p
left join public.donations d on d.project_id = p.id
where p.status in ('active', 'funded', 'closed')
group by p.id;