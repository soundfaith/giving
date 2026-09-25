-- Make funded and completed projects visible in the public catalog and seed demo records.

drop policy if exists "public can read active and funded projects" on public.projects;
drop policy if exists "public can read active projects" on public.projects;
create policy "public can read public project statuses" on public.projects
  for select using (status in ('active', 'funded', 'closed'));

create or replace view public.project_totals as
select
  p.id,
  coalesce(sum(d.amount_tx), 0) as raised_tx,
  count(d.id)::int as donor_count
from public.projects p
left join public.donations d on d.project_id = p.id
where p.status in ('active', 'funded', 'closed')
group by p.id;

insert into public.projects (
  id, church_name, location, title, description, category, goal_tx,
  metadata_token_id, status, created_at
)
values
  (
    '44444444-4444-4444-8444-444444444444',
    'Good Shepherd Fellowship',
    'Nashville, TN',
    'A table for every neighbor',
    'A community kitchen and pantry where families can share meals with dignity.',
    'Community & Outreach',
    12000,
    'demo-metadata-funded-table',
    'funded',
    now() - interval '21 days'
  ),
  (
    '55555555-5555-4555-8555-555555555555',
    'St. Mark Neighborhood Church',
    'Denver, CO',
    'Warmth through the winter',
    'A completed heating renewal that keeps the historic chapel open and welcoming.',
    'Facilities & Maintenance',
    18000,
    'demo-metadata-complete-warmth',
    'closed',
    now() - interval '120 days'
  ),
  (
    '66666666-6666-4666-8666-666666666666',
    'New Mercy Chapel',
    'Savannah, GA',
    'A ramp to the gathering hall',
    'An accessibility project completed with a safer, more dignified entrance for everyone.',
    'Facilities & Maintenance',
    9000,
    'demo-metadata-complete-ramp',
    'closed',
    now() - interval '240 days'
  )
on conflict (id) do update set
  church_name = excluded.church_name,
  location = excluded.location,
  title = excluded.title,
  description = excluded.description,
  category = excluded.category,
  goal_tx = excluded.goal_tx,
  metadata_token_id = excluded.metadata_token_id,
  status = excluded.status,
  created_at = excluded.created_at;

insert into public.donations (
  id, project_id, wallet_address, amount_tx, tx_usd_rate, amount_usd,
  tx_hash, network, created_at
)
values
  ('44444444-4444-4444-8444-444444444441', '44444444-4444-4444-8444-444444444444', 'demo-funded-wallet-01', 4500, 1, 4500, 'demo-funded-tx-0001', 'coreum-testnet', now() - interval '18 days'),
  ('44444444-4444-4444-8444-444444444442', '44444444-4444-4444-8444-444444444444', 'demo-funded-wallet-02', 7500, 1, 7500, 'demo-funded-tx-0002', 'coreum-testnet', now() - interval '14 days'),
  ('55555555-5555-4555-8555-555555555551', '55555555-5555-4555-8555-555555555555', 'demo-complete-wallet-01', 10000, 1, 10000, 'demo-complete-tx-0001', 'coreum-testnet', now() - interval '112 days'),
  ('55555555-5555-4555-8555-555555555552', '55555555-5555-4555-8555-555555555555', 'demo-complete-wallet-02', 8000, 1, 8000, 'demo-complete-tx-0002', 'coreum-testnet', now() - interval '110 days'),
  ('66666666-6666-4666-8666-666666666661', '66666666-6666-4666-8666-666666666666', 'demo-complete-wallet-01', 9000, 1, 9000, 'demo-complete-tx-0003', 'coreum-testnet', now() - interval '225 days')
on conflict (id) do update set
  amount_tx = excluded.amount_tx,
  amount_usd = excluded.amount_usd,
  tx_hash = excluded.tx_hash,
  created_at = excluded.created_at;
