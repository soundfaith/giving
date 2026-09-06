# SoundFaith delivery plan

> Current state: TX testnet vault and Supabase-backed MVP workflows are implemented. See [DEPLOYMENT_RUNBOOK.md](DEPLOYMENT_RUNBOOK.md) for deployment operations and [BLOCKCHAIN_ARCHITECTURE.md](BLOCKCHAIN_ARCHITECTURE.md) for custody behavior.

## Phase 1: Product foundation (complete)

- Responsive discovery homepage and project shelf
- Light/dark theme with persisted preference
- Search, category filtering, mobile navigation
- Donation and social sign-in interaction shells
- TX and Supabase adapter boundaries
- Network-native TX donation model (`utestcore` testnet, `ucore` mainnet)

## Phase 2: Supabase and identity

- Link the Supabase project with the CLI and apply reviewed migrations with `supabase db push`.
- Enable Google, Apple, and email OTP providers in Authentication > Providers.
- Add production and local redirect URLs for the Vercel domain.
- Add `@supabase/supabase-js` and configure `.env.local` from `.env.example`.
- Implement server-side route protection for church administration.
- Keep the identity record limited to email, wallet address, provider, and timestamps.

## Phase 3: Coreum wallet and contract

- Keep the social login and local encrypted Coreum wallet model under security review.
- Maintain the deployed CosmWasm donation vault and its migration process.
- Store the deployed address in `VITE_COREUM_DONATION_CONTRACT`.
- Continue testnet validation for native donations, immediate staking, delayed claims, and expiration recovery.
- Keplr-compatible native TX signing and beneficiary claim controls are implemented in the frontend.
- Wait for transaction confirmation, then persist the tx hash and amount in `donations`.
- Add retry and idempotency handling around confirmation webhooks or polling.
- Durable polling indexer, cursor persistence, Docker packaging, and profile linkage are implemented.

## Phase 4: Smart-token project metadata

- Create a Coreum smart token collection for project records.
- Define immutable fields: project id, church, title, category, goal, image references, and status.
- Store only public project metadata in the token; keep email and private moderation data in Supabase.
- Link each Supabase project to its smart-token id and verify ownership before publishing.

## Phase 5: Church workflow

- Add authenticated church onboarding and organization verification.
- Add project creation with multiple photo uploads to a private Supabase Storage bucket.
- Add moderation states: draft, review, active, funded, closed.
- Add an admin view for reviewing images, metadata, goal, and wallet destination.
- Add project detail pages with donation history and on-chain transaction links.
- Church project submission, owner-wallet capture, moderation UI, project images, and project detail discussion are implemented.

## Phase 6: Production readiness

- Move Coreum configuration from testnet to mainnet only in Vercel production environment variables.
- Configure Namecheap DNS: a CNAME for `www` to Vercel and the apex redirect recommended by Vercel.
- Add Vercel preview, staging, and production environment separation.
- Add monitoring, transaction failure alerts, rate limits, abuse reporting, and backups.
- Run contract security review and a testnet pilot before accepting real TX.
- Pause, metadata update, version migration, and contract status query controls are implemented in the next contract code version. The deployed testnet instance requires a deliberate upload/migrate transaction after review.

## Definition of done

A donation is complete only when the wallet signs a network-native transfer, Coreum confirms the transaction, the contract emits a project donation event, and Supabase stores the confirmed tx hash with the minimal donor identity record.
