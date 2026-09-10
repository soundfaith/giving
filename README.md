# SoundFaith

SoundFaith is a church-project fundraising app focused on sound, AV, accessibility, and gathering spaces. Donations use native TX on the TX blockchain. The current environment is a TX testnet MVP with a CosmWasm vault, a metadata token, Supabase integration boundaries, and a responsive React frontend.

## Current testnet deployment

- Network: `coreum-testnet-1` (TX testnet)
- Owner/deployer wallet: `testcore15xhvchxtkstyhqvpl8pdcfkj69khfp0t8rmhxv`
- HD path: `m/44'/990'/0'/0/0`
- Metadata token: `sfaith-testcore15xhvchxtkstyhqvpl8pdcfkj69khfp0t8rmhxv`
- Vault contract: `testcore1896fkkzeuwlnmaqc422daktfetjww2a8dg0tes2d36nq4day4rzs4424ey`
- Contract code ID: `3939`
- Validator: `testcorevaloper1eegug92k2gp9c6kqjsadk3tku29sr2rsryjszy`
- Custody: native `utestcore` is held/staked by the CosmWasm vault, not by the metadata token

See [DEPLOYMENT_RUNBOOK.md](DEPLOYMENT_RUNBOOK.md) and [BLOCKCHAIN_ARCHITECTURE.md](BLOCKCHAIN_ARCHITECTURE.md) for current operating details.

## Architecture

```text
React/Vercel frontend
  -> Supabase Auth + public project reads
  -> TX wallet signer
  -> CosmWasm donation vault
  -> TX transaction indexer
  -> Supabase donation ledger
```

### Contract vault

The contract accepts exactly one configured network-native coin per donation (`utestcore` on testnet, `ucore` on mainnet), rejects inactive projects and overfunding, tracks donor totals, and emits `donation_received`. It does not forward funds to an operator wallet. After the exact goal is reached, the configured project beneficiary can execute `claim_project_funds` once.

The smart token is metadata-only. It identifies public project metadata; it is not a custody account and does not hold the donation balance.

### Project attestation contract

`contracts/attestation` is a separate CosmWasm contract for project validation. It calculates `min(5 + floor(goal_tx / 10000), 30)` required attestations, requires a weighted score of four times that threshold, pauses on any fraud flag, and records reviewer wallet, decision, and reputation on-chain. The owner can register approved reviewers, register projects, and perform an emergency status override. Build it with `npm run coreum:build:attestation` and deploy it separately from the donation vault after an independent contract review.

TX provides a separate authenticated Marketplace KYC API. `supabase/functions/sync-tx-kyc` calls `GET /kyc/get?external_user_id=...` with the TX auth token and stores only `externaluserid` and normalized `kyc_status`; it discards the response, which contains PII. TX's documented response does not expose a reliable applicant type, so `applicant_type` starts as `unknown` and must be set to `individual` or `company` by an authorized admin after the appropriate compliance review. Project creation is blocked unless the owner wallet is approved and classified as `company`; attestation submission is blocked unless the reviewer is approved and classified as `individual`.

Deploy the function with `supabase functions deploy sync-tx-kyc --no-verify-jwt`. The function requires the caller's runtime TX authorization value in `X-TX-Authorization`; it does not store or invent a TX API key. `TX_NETWORK` and `TX_KYC_BASE_URL` remain static configuration values. Migration `017` leaves KYC and attestation enforcement disabled while TX Marketplace is unavailable, so the existing admin moderation flow remains authoritative. An admin can later enable both checks with `admin_set_validation_mode(true, true)`.

```powershell
supabase secrets set TX_NETWORK=testnet TX_KYC_BASE_URL=https://com-be-kyc-service-zk6dps4acq-uc.a.run.app
```

Call the function with an authenticated Supabase user session, the runtime TX token in `X-TX-Authorization`, and `{ "externalUserId": "...", "walletAddress": "..." }`. The admin-only database function `admin_set_identity_applicant_type(uuid, text)` assigns the trusted `individual` or `company` classification.

To test the TX endpoint without storing credentials, run `npm run tx:check-kyc` with `TX_EXTERNAL_USER_ID` and `TX_AUTHORIZATION` set in the current shell. The script prints only the HTTP status, external ID, and KYC status; it never prints the token or raw KYC response.

### Donation tracking

The source of truth is TX transaction history, not a webhook. [scripts/coreum-indexer.ts](scripts/coreum-indexer.ts) scans only our contract address, requires the expected donation event attributes, persists a cursor in Supabase, and upserts by transaction hash. It can replay missed blocks after downtime.

Run it as a private always-on worker with the Supabase service-role key. Do not run it in the browser or expose the service-role key to Vercel client code.

## Local development

```powershell
npm install
npm run dev
```

Production build and checks:

```powershell
npm run typecheck:scripts
npm run build
```

The frontend uses mock projects when Supabase is not configured. When `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are present, active projects are read from Supabase.

## Environment variables

Copy `.env.example` to `.env.local`:

```text
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_COREUM_NETWORK=testnet
VITE_COREUM_RPC_URL=https://rpc.testnet-1.tx.org:443
VITE_COREUM_DONATION_CONTRACT=testcore1896fkkzeuwlnmaqc422daktfetjww2a8dg0tes2d36nq4day4rzs4424ey
```

Server-only worker/deployment values belong in the worker environment, not the frontend:

```text
COREUM_MNEMONIC=
COREUM_RPC_URL=https://rpc.testnet-1.tx.org:443
COREUM_CHAIN_ID=coreum-testnet-1
COREUM_BECH32_PREFIX=testcore
COREUM_DERIVATION_PATH=m/44'/990'/0'/0/0
COREUM_DONATION_CONTRACT=testcore1896fkkzeuwlnmaqc422daktfetjww2a8dg0tes2d36nq4day4rzs4424ey
SUPABASE_SERVICE_ROLE_KEY=
```

Never commit a mnemonic, private key, service-role key, or OAuth secret. The deployed wallet mnemonic is only used locally for deployment/token issuance and is not part of the application runtime.

## Supabase setup

Use the Supabase CLI workflow in [DEPLOYMENT_RUNBOOK.md](DEPLOYMENT_RUNBOOK.md): ask the user to run `supabase login` if needed, link the project, inspect migration status, and apply migrations with `supabase db push`. Configure Google and email providers under Authentication > Providers and add localhost plus production callback URLs under Authentication > URL Configuration.

Create a `project-photos` Storage bucket. Church uploads should go through an authenticated server-side route or Edge Function. Public visitors may read active projects, but anonymous clients must not insert projects, profiles, identities, or donations.

The app links a Supabase Auth user to only an email and public Coreum wallet address through `profiles`. Google and Apple use Supabase OAuth; email uses a passwordless magic link. No provider, profile metadata, mnemonic, password, or private key is stored in Supabase.

## Network denomination

TX is the current chain branding, but the native minimal denomination is network-specific: `utestcore` on testnet and `ucore` on mainnet. The old deployed vault hard-coded `utx`; migrate it with `npm run coreum:migrate:credential -- -CodeId <corrected-code-id>` after uploading the corrected WASM and reviewing the migration on a fresh testnet instance.

The MVP admin console is available at `#/admin` for the seeded admin wallet `testcore1hzt8gdqgvhxut95sn4cy9c2xh0t9m2uamwy726`. It manages reviewer activation, review thresholds, and direct project publish/close actions. Run migrations 004 and 005 after the base schema. This console is intentionally an MVP control plane and should be disabled before production in favor of multisig or on-chain governance.

The current frontend lifecycle is:

1. Google or Apple OAuth, or an email magic link, authenticates the user with Supabase.
2. The profile panel creates a Coreum HD wallet in the browser, encrypts its CosmJS serialization with a user-chosen password, and stores that encrypted blob only in IndexedDB.
3. The user exports an encrypted JSON backup. SoundFaith never receives the mnemonic or password; losing both the browser vault and backup loses the wallet.
4. Donations use the local wallet after the user enters its password for signing. Keplr remains available as a fallback for users who do not create a local wallet.
5. The indexer associates confirmed transaction wallets back to the email identity using only the public wallet address.

Social login authenticates the person but does not custody the wallet. Wallet creation is explicit and requires a user-chosen password plus an exportable encrypted backup. Do not silently generate a wallet or upload its mnemonic.

## Wallet policy

For users who already have a Coreum wallet, the production path may connect an extension and request a signature. The default path is the browser-owned encrypted wallet described above.

For users without a wallet, do not store a generated mnemonic in Supabase. A no-third-party option is a browser-generated wallet whose encrypted key backup is protected by a user-chosen password or passkey, with an explicit recovery/export flow. This requires careful UX and security review. If the user loses the password/passkey and backup, the wallet cannot be recovered. A hosted custodial wallet service is easier but introduces a third-party trust and key-management dependency.

The account panel includes wallet creation, encrypted backup export/import, Coreum balance, owned-project, and donation-history views. This browser-wallet flow still needs an independent security review before mainnet funds are accepted.

## Deploying the vault

Install Rustup first, then use the funded wallet stored in Windows Credential Manager. The credential target is `soundfaith-wallet-devnet` and the username is `mnemonic`. The wrapper verifies the derived owner address and never prints the mnemonic.

Follow [DEPLOYMENT_RUNBOOK.md](DEPLOYMENT_RUNBOOK.md) for the exact Rust, WASM, deployment, migration, and Supabase commands.

## Blockchain work remaining

1. Add a production wallet signer and encrypted recovery/export flow.
2. Deploy the indexer as a monitored private worker with retries, alerts, and backfill controls.
3. Add authenticated church project creation, moderation, photo storage, and smart-token metadata updates.
4. Add beneficiary claim UI and a safer multi-party/admin policy before real funds.
5. Add contract migration/versioning, pause/emergency policy, formal tests, and an external security review.
6. Test exact-denom handling, goal edge cases, duplicate indexer events, chain reorg/replay behavior, and failed signatures.
7. Run a testnet pilot before changing any configuration to TX mainnet.

## Contract migration and security review

The source contract now includes `SetPaused`, `UpdateProjectMetadata`, `ContractStatus`, and `migrate`. These changes are not active on the existing testnet instance until the new WASM is uploaded and the contract is migrated. Use `npm run coreum:deploy:credential -- --upload-only` with the optimized artifact to obtain a new code ID, then run `npm run coreum:migrate:credential -- -CodeId <new-code-id>` only after reviewing the diff and testing on a fresh testnet instance.

Before real funds, obtain an external CosmWasm review covering authorization, goal accounting, beneficiary claims, paused state, migration compatibility, denom handling, re-entrancy assumptions, and event/indexer correctness. The included unit tests are necessary but not a substitute for external review.

## Testnet pilot

Pilot checklist: create a fresh small project, make donations from two wallets, test a rejected over-goal donation, stop and restart the indexer, verify exactly one Supabase row per tx hash, reach the goal, claim from the beneficiary wallet, verify the contract balance is zero for that project, test pause/unpause on the migrated code, and record every transaction hash. Do not configure mainnet until this checklist and the external review are complete.

## Project files

- [src/App.tsx](src/App.tsx): public discovery UI and auth/donation interaction shell
- [src/lib/supabase.ts](src/lib/supabase.ts): Supabase client and repositories
- [src/lib/coreum.ts](src/lib/coreum.ts): Coreum frontend boundary
- [contracts/donation/src/lib.rs](contracts/donation/src/lib.rs): vault contract
- [scripts/coreum-indexer.ts](scripts/coreum-indexer.ts): replayable donation indexer
- [scripts/issue-metadata-token.ts](scripts/issue-metadata-token.ts): testnet metadata token issuance
- [supabase/schema.sql](supabase/schema.sql): database/RLS setup
- [SETUP.md](SETUP.md): operational setup checklist
