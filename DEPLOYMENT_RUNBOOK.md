# SoundFaith Deployment Runbook

This runbook is for the repository's Coreum testnet and Supabase deployment workflow.

## Security rules

- Never paste a mnemonic, private key, Supabase access token, or service-role key into chat or commit one to the repository.
- The contract deployer mnemonic is loaded locally from Windows Credential Manager.
- Supabase CLI login is interactive. Ask the user to log in first if the CLI session is missing or expired.
- Review migrations before applying them. Migration 011 is destructive: it resets Supabase demo data and keeps only the configured admin profile.
- Contract deployment and migration are blockchain transactions. Confirm the target network, signer address, WASM artifact, and contract address before broadcasting.

## Current testnet deployment

- Chain: `coreum-testnet-1`
- RPC: `https://rpc.testnet-1.tx.org:443`
- Native denom: `utestcore`
- Staking validator: `testcorevaloper1eegug92k2gp9c6kqjsadk3tku29sr2rsryjszy`
- Contract: `testcore18wsejajlp9flsdymm5j6xutuwkumrvg7twuz9rzwyf7cnq040fpqluslfg`
- Code ID: `3939`
- Owner/deployer wallet: `testcore15xhvchxtkstyhqvpl8pdcfkj69khfp0t8rmhxv`

The owner wallet is loaded from the Windows Generic Credential:

- Target: `soundfaith-wallet-devnet`
- Username: `mnemonic`

The credential wrapper verifies the derived address before signing.

## Deploying the CosmWasm contract

Rust must be installed before compiling. On Windows, install Rustup once:

```powershell
winget install --id Rustlang.Rustup --exact --accept-source-agreements --accept-package-agreements
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
rustup target add wasm32-unknown-unknown
```

The contract is pinned to Rust 1.86:

```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
rustup run 1.86.0 cargo build --manifest-path contracts/donation/Cargo.toml --release --target wasm32-unknown-unknown
npx wasm-opt .\contracts\donation\target\wasm32-unknown-unknown\release\soundfaith_donation.wasm -o .\contracts\donation\target\wasm32-unknown-unknown\release\soundfaith_donation.optimized.wasm -Oz --mvp-features --llvm-memory-copy-fill-lowering
```

Deploy with the funded wallet in Windows Credential Manager:

```powershell
$env:Path = "$(npm prefix --global);$env:Path"
powershell -ExecutionPolicy Bypass -File .\scripts\deploy-from-windows-credential.ps1 -ExpectedAddress testcore15xhvchxtkstyhqvpl8pdcfkj69khfp0t8rmhxv
```

The script reads the mnemonic locally, derives the address, uploads the WASM, and instantiates the contract. It does not print the mnemonic. Review the returned code ID, contract address, and transaction hashes before updating `.env.local`.

For an existing contract, upload only and then migrate deliberately:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\deploy-from-windows-credential.ps1 -UploadOnly -ExpectedAddress testcore15xhvchxtkstyhqvpl8pdcfkj69khfp0t8rmhxv
powershell -ExecutionPolicy Bypass -File .\scripts\migrate-from-windows-credential.ps1 -CodeId <new-code-id> -ContractAddress <existing-contract-address> -ExpectedAddress testcore15xhvchxtkstyhqvpl8pdcfkj69khfp0t8rmhxv
```

## Supabase deployment

If the Supabase CLI is not authenticated, ask the user to run:

```powershell
$env:Path = "$(npm prefix --global);$env:Path"
supabase login
```

Then link the project:

```powershell
supabase link --project-ref gqnrvnsoyhirpvcvxapl
```

For Google sign-in on Vercel, add the deployed Vercel origin to Supabase Dashboard -> Authentication -> URL Configuration -> Redirect URLs. Also configure the Google OAuth provider with this Supabase callback URL:

```text
https://gqnrvnsoyhirpvcvxapl.supabase.co/auth/v1/callback
```

The app sends the current Vercel origin as the OAuth redirect target. The Google provider must be enabled in Supabase, and the exact Vercel URL must be listed in Supabase's redirect allowlist.

After pushing changes to `main`, confirm that the Vercel production alias points to the new deployment rather than only to a generated preview URL.

Check status before applying migrations:

```powershell
supabase migration list
```

Apply repository migrations through the linked Supabase project:

```powershell
supabase db push
```

The migration sequence currently includes:

- `002` to `009`: profiles, wallet persistence, reviewer controls, chat, images, samples, and notifications
- `010`: project owner wallet capture and the updated admin project RPC
- `011`: destructive demo reset that preserves only the configured admin profile and wallet
- `012`: separates reviewer/admin approval from private relayer chain registration

Do not run migration 011 casually. It deletes Supabase projects, profiles, donations, comments, notifications, reviewer data, auth users other than the preserved admin, and project image records. It does not delete Coreum contract state or on-chain funds. Supabase Storage objects must be removed separately through the Dashboard or Storage API because direct SQL deletion from `storage.objects` is blocked.

## Running the private relayer

The admin page only bypasses the reviewer decision. It changes a project from `review` to `approved_pending_chain`. The relayer below is the only application process that signs `register_project` with the contract-owner wallet. After the transaction succeeds, it calls the service-role activation RPC, which changes the project to `active`.

Run it in a private worker environment with `COREUM_MNEMONIC`, `COREUM_DONATION_CONTRACT`, `VITE_SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY` configured, plus the optional Coreum connection variables described in the scripts:

```powershell
npm run coreum:relayer:credential
```

On the Windows deployment machine, install it as a per-user Scheduled Task so it starts at logon and restarts after a failure:

```powershell
npm run coreum:relayer:install
```

The task is named `SoundFaith Coreum Relayer`. It runs under the Windows user that installed it, which gives it access to that user's Windows Credential Manager entry and Supabase CLI login. It polls every 10 seconds, so no manual trigger is needed after an admin approval. To remove the task:

```powershell
npm run coreum:relayer:uninstall
```

For a one-time queue drain or deployment check, add `-Once` to the wrapper command. The wrapper retrieves the Supabase `service_role` key through the authenticated Supabase CLI and the contract-owner mnemonic from Windows Credential Manager, then removes both from the process environment when it exits.

The relayer uses each project's `owner_wallet_address` as the on-chain beneficiary. It never signs with or replaces that wallet, and it does not expose the contract-owner mnemonic to the browser.

The relayer is needed for project registration only. It should remain running while admins can approve projects. Donations, claims, profile balance reads, and reviewer actions do not trigger it.

## Sample data and claim testing

After deploying a compatible contract and configuring the validator, the credential wrapper can seed the sample projects:

```powershell
$env:Path = "$(npm prefix --global);$env:Path"
powershell -ExecutionPolicy Bypass -File .\scripts\seed-from-windows-credential.ps1
```

The seeder configures the validator, registers sample projects, and funds the fully funded sample. The claim lifecycle is:

1. First claim starts validator undelegation.
2. Wait for the validator's seven-day unbonding period.
3. Run the claim again to release funds to the recorded beneficiary wallet.

## Validation

```powershell
npm run build
npm run typecheck:scripts
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
cargo test --manifest-path contracts/donation/Cargo.toml
```

## Documentation ownership

- `README.md`: short project overview and current deployment pointers
- `SETUP.md`: first-time local setup
- `PROJECT_PLAN.md`: product status and remaining work
- `BLOCKCHAIN_ARCHITECTURE.md`: contract, custody, staking, and expiration behavior
- `DEPLOYMENT_RUNBOOK.md`: operational deployment instructions
