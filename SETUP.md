# SoundFaith setup

## Required accounts

1. **Supabase**: database, Auth, Storage, and optional Edge Functions.
2. **TX**: testnet wallet, faucet funds, RPC/REST access, and later a mainnet wallet.
3. **Social auth provider**: Google/Apple OAuth or email magic links through Supabase Auth. The TX wallet is generated and encrypted locally in the browser; no social wallet custody provider is required.
4. **Vercel**: frontend deployment and environment variables.
5. **Namecheap**: domain DNS management.

## Supabase checklist

1. Create a project and copy the project URL and anon key.
2. Ask the user to run `supabase login` if the CLI is not authenticated.
3. Link the project with `supabase link --project-ref <project-ref>`.
4. Review status with `supabase migration list`, then apply migrations with `supabase db push`.
5. Treat migration 011 as destructive demo reset SQL; run it only when intentionally emptying Supabase while preserving the configured admin.
5. Enable Google, Apple, and email OTP under Authentication > Providers.
6. Add `http://localhost:5173` and the production Vercel/Namecheap URLs under Authentication > URL Configuration.
7. The migrations create/configure `project-photos`. Delete Storage objects through the Dashboard or Storage API, not direct SQL.
8. Configure database webhooks or an Edge Function to reconcile confirmed TX transactions.

The reviewer council is wallet-identified but not automatically trusted. A council steward must activate reviewer applications in `public.reviewers`; active reviewers vote at `#/review`. Three independent approvals publish a project and three rejections close it. The steward activation step should eventually move to an on-chain governance contract or multisig before production.

During the MVP, the authenticated email `soundfaith.core@gmail.com` can open `#/admin`, regardless of its linked wallet. The admin can activate reviewers, suspend reviewers, change approval/rejection thresholds, publish projects, and close projects. Before deployment, replace that email in the admin registry and move these powers to reviewed multisig or on-chain governance.

The primary reconciliation path is the continuously running TX indexer in `scripts/coreum-indexer.ts`, not a webhook. Run it as a private worker with the Supabase service-role key. It stores a block cursor in `indexer_state`, scans contract events after downtime, and uses the transaction hash as an idempotency key. Webhooks may still be used as an optional alert, but they are not the source of truth.

## Local environment

Copy `.env.example` to `.env.local` and fill in:

```text
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_COREUM_NETWORK=testnet
VITE_COREUM_RPC_URL=https://rpc.testnet-1.tx.org:443
VITE_COREUM_REST_URL=https://rest.testnet-1.tx.org:443
VITE_COREUM_DONATION_CONTRACT=
```

Never put a Supabase service-role key, OAuth client secret, wallet mnemonic, wallet password, or private key in a `VITE_` variable or the frontend repository. The encrypted browser backup is downloaded only by the user.

## Coreum checklist

1. Create a testnet wallet and fund it from the Coreum faucet.
2. Decide the contract owner and project beneficiary model before deployment. Donations stay in the contract vault; the beneficiary only receives funds after the project reaches its goal and `claim_project_funds` is executed.
3. Build and deploy the CosmWasm contract described in [`contracts/donation/README.md`](contracts/donation/README.md).
4. Record the contract address and smart-token collection id in Supabase.
5. Test network-native `utestcore` transfers on testnet, rejected inactive projects, duplicate confirmations, and failed wallet signatures.
6. Only after a testnet pilot, configure separate Vercel production variables for Coreum mainnet.

## Local contract deployment

Install Rustup before compiling. The Windows Credential Manager wrapper reads the funded wallet locally without printing the mnemonic. Never paste the mnemonic into chat, commit it, or put it in a `VITE_` variable.

Example PowerShell session using a local secret manager or a short-lived terminal environment variable:

```powershell
$env:COREUM_MNEMONIC = '<load this locally from your password manager; do not paste it into chat or commit it>'
$env:COREUM_BECH32_PREFIX = 'testcore'
$env:COREUM_EXPECTED_ADDRESS = '<your funded testnet address>'
npm run coreum:deploy -- --wasm .\contracts\donation\artifacts\donation.wasm
Remove-Item Env:COREUM_MNEMONIC
```

If the mnemonic is stored as a Windows Generic Credential with target `soundfaith-wallet-devnet` and username `mnemonic`, use the maintained commands in [`DEPLOYMENT_RUNBOOK.md`](DEPLOYMENT_RUNBOOK.md):

```powershell
npm run coreum:deploy:credential
```

The wrapper reads the credential through Windows Credential Manager, passes it only to the child process, and clears it when deployment finishes.

The wrapper also verifies that the credential derives to the funded address. If it reports a different address, update the Windows Credential Manager entry to use the funded wallet's mnemonic; do not fund the wrong derived account just to make deployment work.

The testnet vault is deployed. Public deployment identifiers are recorded in [`contracts/deployment.testnet.json`](contracts/deployment.testnet.json). Set `VITE_COREUM_DONATION_CONTRACT` and `COREUM_DONATION_CONTRACT` to that contract address in your local/server environments.

The current deployed contract and code ID are maintained in [`DEPLOYMENT_RUNBOOK.md`](DEPLOYMENT_RUNBOOK.md). Never migrate a vault holding funds without verifying the denomination and payout behavior first.

## Deployment

1. Push the repository to GitHub and import it into Vercel.
2. Set Preview variables to Coreum testnet and Production variables to Coreum mainnet.
3. Set the Vercel project domain, then configure Namecheap DNS using the exact records Vercel provides. Usually `www` is a CNAME and the apex domain uses Vercel's A/redirect instructions.
4. Add every deployed URL to Supabase Auth redirect allowlists.
5. Run `npm run build` in CI before each deployment.

## External packages to add in the integration phases

- `@supabase/supabase-js`: database, Auth, and Storage client.
- A supported Coreum/Cosmos wallet SDK or the selected social wallet provider SDK.
- A CosmWasm client such as `@cosmjs/cosmwasm-stargate` for contract execution and queries.
- A schema validator such as `zod` for Edge Function and contract event payloads.

The current local app intentionally uses mock project data and a simulated confirmation state so the interface remains usable before credentials and contract addresses exist. Coreum smart tokens are treated as optional public metadata references, not as the custody layer; the CosmWasm contract is the vault.
