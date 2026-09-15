# Handoff: Adopt the White-label Donation Protocol in `giving`

## Purpose

Give this document to the code agent working in `C:\Users\Public\project\giving`.

The goal is to make the existing `giving` application consume the deployed standalone white-label donation protocol from `C:\Users\Public\project\donation_protocol`. The application is the first partner platform, not the owner of a separate donation contract. It must remain a client/integration layer and must not copy contract custody logic into TypeScript, Supabase, an API route, or a relayer.

This is an integration task. Do not deploy another donation contract from `giving`, and do not migrate the shared protocol until the protocol ABI, chain behavior, and migration plan have been reviewed.

## Source protocol repository

Protocol repository:

```text
C:\Users\Public\project\donation_protocol
```

Read these files before editing the application:

- `README.md`
- `INTEGRATION.md`
- `COMPATIBILITY.md`
- `SECURITY.md`
- `src/msg.rs`
- `src/state.rs`
- `src/contract.rs`
- `tests/contract.rs`

The Rust contract is the custody source of truth. The application may index and cache chain state, but cached state must be reconciled against contract queries.

## Shared protocol deployment

The white-label protocol is already deployed as the single shared donation contract for all partner platforms:

- Contract: `testcore184vcst03q9p540al5jw3pytjprn7mlr456w9xh0th5awgeyvf3wqz8d8mr`
- Explorer: `https://explorer.testnet-1.tx.org/tx/accounts/testcore184vcst03q9p540al5jw3pytjprn7mlr456w9xh0th5awgeyvf3wqz8d8mr`
- Code ID: `3950` (migrated in place from `3948`)
- Instantiate transaction: `9413BF701A5F81EA97A9817B2939BB516DBAED5777A5C7C5F38C7477CBA181B8`
- Migration transaction: `673968511EE7D65AC8942A5F6B1892E156F2D6CA90FC5FBDF3011822C5AAD52B`
- Chain ID: `coreum-testnet-1`
- RPC: `https://rpc.testnet-1.tx.org:443`
- Native denom: `utestcore`
- Staking validator: `testcorevaloper1eegug92k2gp9c6kqjsadk3tku29sr2rsryjszy`
- Unbonding period: `604800` seconds

The contract currently has no registered projects. The `giving` project must register approved projects on this shared contract; it must not deploy or instantiate a contract of its own.

The Windows Credential Manager entry is deployment-only and is not used by the application:

- Credential target: `soundfaith-wallet-devnet`
- Credential username: `mnemonic`

The mnemonic must only be loaded locally by a deployment/signing script. It must never be placed in contract messages, protocol state, frontend code, Supabase, source control, logs, or chat. The protocol itself has no knowledge of Windows Credential Manager.

Chain configuration is also deployment configuration. For the current `giving` testnet, the known values are:

- Chain ID: `coreum-testnet-1`
- RPC: `https://rpc.testnet-1.tx.org:443`
- Native denom: `utestcore`
- Bech32 prefix: `testcore`
- Derivation path: `m/44'/990'/0'/0/0`

Load these values from the application's public network configuration. Do not expose the deployment mnemonic to `giving`, the browser, Supabase, or any partner platform.

## Existing `giving` behavior to preserve during transition

The current application was built around a separate SoundFaith-specific contract. That contract is not the target for this integration. The `giving` application must adapt its workflow to the shared protocol:

1. Project review happens in the application.
2. The approved project's saved wallet is the on-chain beneficiary.
3. The owner/relayer registers the project on-chain.
4. Donors send exactly one `utestcore` coin with `donate`.
5. Donations may be delegated to a configured validator.
6. A funded beneficiary's first claim starts undelegation.
7. A later claim after the seven-day unbonding period releases funds.
8. Expiration and refunds are handled by the shared protocol's `expire_project_funds` and `refund_donation` messages.

Do not silently replace this behavior with app-managed custody. The shared protocol's optional staking mode supports the delayed claim lifecycle, but the app must use the shared protocol messages and queries instead of the old contract schema.

## Protocol API to integrate

The standalone protocol's instantiate message has this shape:

```json
{
  "native_denom": "utestcore",
  "owner": "testcore1multisig...",
  "protocol_fee_bps": 0,
  "default_platform_fee_bps": 0,
  "protocol_treasury": null,
  "paused": false,
  "staking": {
    "enabled": true,
    "validator": "testcorevaloper1...",
    "unbonding_seconds": 604800
  },
  "projects": []
}
```

Use `staking: null` or omit it for a non-staking deployment. The protocol owner can configure it later:

```json
{
  "configure_staking": {
    "enabled": true,
    "validator": "testcorevaloper1...",
    "unbonding_seconds": 604800
  }
}
```

Disable future delegation with:

```json
{
  "configure_staking": {
    "enabled": false,
    "validator": null,
    "unbonding_seconds": null
  }
}
```

Disabling does not cancel already delegated funds. Existing projects finish their unstaking lifecycle.

Register a generic project:

```json
{
  "register_project": {
    "project": {
      "id": "soundfaith:<application-project-id>",
      "beneficiary": "testcore1beneficiary...",
      "goal": "24000000000",
      "metadata_uri": "ipfs://...",
      "platform_id": "soundfaith",
      "fee_bps": 0,
      "expires_at": 1790000000,
      "status": "active"
    }
  }
}
```

Donate:

```json
{
  "donate": {
    "project_id": "soundfaith:<application-project-id>"
  }
}
```

Funds attached to the transaction must contain exactly one non-zero `utestcore` coin. The contract rejects overfunding; the total raised amount may not exceed the goal.

Claim:

```json
{
  "claim_project_funds": {
    "project_id": "soundfaith:<application-project-id>"
  }
}
```

With staking disabled, a funded claim pays fees and the beneficiary in one transaction. With staking enabled and funds delegated, the first claim changes status to `unstaking` and emits an undelegation. The beneficiary must submit the same claim again after `unbonding_seconds`.

Expire and refund:

```json
{
  "expire_project_funds": {
    "project_id": "soundfaith:<application-project-id>"
  }
}
```

Then each donor can claim their own recorded gross contribution once:

```json
{
  "refund_donation": {
    "project_id": "soundfaith:<application-project-id>"
  }
}
```

## Queries the application must use

Project state:

```json
{
  "project": {
    "project_id": "soundfaith:<application-project-id>"
  }
}
```

Donor total:

```json
{
  "donor_total": {
    "project_id": "soundfaith:<application-project-id>",
    "wallet_address": "testcore1donor..."
  }
}
```

Contract and staking status:

```json
{ "contract_status": {} }
{ "config": {} }
```

The application should treat these fields as authoritative:

- `status`: `draft`, `active`, `funded`, `unstaking`, `expiring`, `expired`, or `closed`
- `raised`
- `goal`
- `donor_count`
- `beneficiary`
- `staked`
- `unstaking_started_at`
- `claimed_at`
- `expires_at`
- `platform_id`

Never calculate `funded` from a Supabase total alone. Query the contract after transaction confirmation.

## Mapping from the current application model

Keep application identity separate from blockchain identity:

| Current application value | Protocol value |
|---|---|
| Supabase project primary key | Part of the unique on-chain project ID |
| `owner_wallet_address` | `beneficiary` |
| Application title/content/images | `metadata_uri` or off-chain indexer data |
| SoundFaith/application namespace | `platform_id` |
| Stored donation ledger | Reconciled indexer copy of `donate` events |
| Reviewer approval | Off-chain prerequisite before owner registration |
| Contract owner/relayer | Protocol `owner`, never the beneficiary |

Use a deterministic project ID such as `soundfaith:<uuid>`. Store the exact on-chain ID and registration transaction hash in the application database.

Do not put email addresses, Supabase IDs, private keys, review comments, or user profile data into the protocol.

## Required application changes

1. Add a single protocol client module that contains the contract address, RPC client, message types, query helpers, and transaction helpers.
2. Replace app-specific message construction with the protocol message shapes above.
3. Keep project review and compliance in the application, but only register approved projects on-chain.
4. Preserve the beneficiary wallet captured at project submission; do not derive it from email or the currently connected wallet during claim.
5. Update donation indexing to recognize `action=donate`, `project_id`, `donor_address`, and `amount_microtx`.
6. Update claim monitoring for `claim`, `project_funds_unstaking`, and the later closed/release transaction.
7. Expose staking status and the next required action to operators: `funded`, `unstaking`, waiting, or ready to claim again.
8. Use `contract_status` and `config` to display pause and staking configuration in admin diagnostics.
9. Reconcile indexer totals against `project` and `donor_total` queries.
10. Remove the old contract address from the active `giving` integration path. Use the shared protocol address above. Keep the old contract only as a historical/legacy reference until its projects and funds have been explicitly reconciled.

## Suggested client boundaries

Create or adapt a module with functions equivalent to:

```ts
registerProject(project)
donate(projectId, amountMicrotx)
claimProjectFunds(projectId)
expireProjectFunds(projectId)
refundDonation(projectId)
queryProject(projectId)
queryDonorTotal(projectId, walletAddress)
queryContractStatus()
queryConfig()
```

The client should not expose mnemonic values to browser code. Browser transactions should be signed by the user's wallet. Owner-only operations should be signed by the configured owner/relayer in a private operational process.

## Migration strategy

Do not call `migrate` from the old SoundFaith contract to this shared protocol merely because both are CosmWasm contracts. Their storage layouts and message schemas differ. The shared protocol is already deployed as a new contract.

Use this sequence:

1. Configure `giving` to use the deployed shared protocol address.
2. Register one non-production `giving` project through the shared protocol.
3. Test donation, exact-goal funding, overfunding rejection, staking delegation, first claim, unbonding, second claim, expiry, and refunds.
4. Validate event ingestion and query reconciliation.
5. Decide how legacy SoundFaith projects and funds are handled. Do not move funds automatically.
6. Run a parallel validation period before switching production project registration to the shared protocol.
7. After approval, stop creating new projects in the old contract.

A state migration from the current vault requires a purpose-built compatibility contract or an explicit off-chain/chain reconciliation process. It must preserve beneficiary ownership and avoid arbitrary fund transfers.

## Deployment separation

The protocol repository's deployment script may read `soundfaith-wallet-devnet` / `mnemonic` from Windows Credential Manager. That is only a local signer bootstrap. The `giving` application must never receive or bundle the mnemonic.

Deployment requires operator-supplied network parameters, for example:

```powershell
 .\scripts\deploy.ps1 -ChainRpc 'https://rpc.testnet-1.tx.org:443' -ChainId 'coreum-testnet-1'
```

Review the derived wallet address, code ID, contract address, and transaction hashes before configuring the application. Store only public deployment outputs such as RPC, chain ID, native denom, code ID, and contract address in application configuration.

## Acceptance criteria

The code agent is done only when:

- The application can query a protocol project and donor total.
- A test project can be registered with a stable namespaced ID.
- A wallet can donate exact native funds.
- Overfunding is rejected before state changes.
- A funded non-staking project can be claimed.
- A funded staking project enters `unstaking`, waits the configured period, and then releases.
- Expiry and refund behavior is visible and tested.
- Pause behavior is surfaced to operators.
- Events are indexed idempotently by transaction hash and project ID.
- No mnemonic or private key appears in source, frontend bundles, database rows, logs, or chat.
- The existing deployed SoundFaith contract is not changed without explicit migration approval.

## Current migration gate

As of 2026-09-15, the documented shared contract address is not yet proven to be the updated protocol deployment. Its live `contract_status` and `config` queries work, but `partner` and `platform_config` queries fail and the registry is empty. Treat partner allowlisting, namespaced project enforcement, and the final fee policy as protocol deployment blockers, not application assumptions.

The current giving relayer and indexer still use the legacy contract shape and event name. Do not reset Supabase, seed production-like projects, or restart the Raspberry Pi against the shared address until the protocol ABI, application client, Edge Function, indexer, and relayer have been updated together and a disposable end-to-end test has passed.

## Final instruction to the code agent

Implement the integration against the standalone protocol as a generic chain client. Treat `giving` as one platform using the protocol, not as the owner of the protocol design. Preserve the existing application's review, UX, and indexing responsibilities, but move custody rules, donation accounting, staking state, fees, expiry, refunds, and payout authorization to the deployed protocol contract.
