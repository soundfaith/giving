-- Demo rows for local/testnet testing. Register the same IDs on the donation
-- contract with scripts/seed-sample-projects.ts before testing donations.

insert into public.projects (
  id, church_name, location, title, description, category, goal_tx,
  metadata_token_id, status
)
values
  (
    '11111111-1111-4111-8111-111111111111',
    'Harbor Light Church',
    'Portland, OR',
    'A clear voice for every seat',
    'A small test project for validating ordinary donations and on-chain totals.',
    'Sound & AV',
    2,
    '',
    'active'
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    'St. Brigid Community',
    'Austin, TX',
    'A room that welcomes everyone',
    'A sample project for checking project details, comments, and image rendering.',
    'Spaces',
    3,
    '',
    'active'
  ),
  (
    '33333333-3333-4333-8333-333333333333',
    'Grace Table',
    'Raleigh, NC',
    'A ramp to the front door',
    'A fully funded one TX test project for exercising stake, unstake, and claim.',
    'Access',
    1,
    '',
    'active'
  )
on conflict (id) do update set
  church_name = excluded.church_name,
  location = excluded.location,
  title = excluded.title,
  description = excluded.description,
  category = excluded.category,
  goal_tx = excluded.goal_tx,
  status = excluded.status;
