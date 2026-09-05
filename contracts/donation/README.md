# SoundFaith donation contract

This repository now includes a starter CosmWasm implementation in `src/lib.rs`. It is designed for Coreum testnet, with mainnet configuration supplied at deployment time. It must receive a security review and be compiled with the Coreum-supported Rust/CosmWasm toolchain before any deployment.

## Responsibilities

- Accept exactly one configured network-native transfer for a project and hold it in the contract vault.
- Emit one `donation_received` event with `project_id`, donor wallet, amount, and transaction network.
- Keep project totals and donor counts queryable without storing donor profile data.
- Store an optional Coreum smart-token id that contains the project's public metadata.
- Release a fully funded project's vault balance to its configured beneficiary after an explicit claim.
- Stake accepted donations immediately when a validator is configured.
- Start unstaking on claim and require the chain unbonding period before release.
- Move expired, unclaimed funds into a contract-controlled holding-project accounting bucket after one year.
- Reject donations for inactive or closed projects.

## Execute messages

```json
{"donate":{"project_id":"project-uuid"}}
{"claim_project_funds":{"project_id":"project-uuid"}}
{"expire_project_funds":{"project_id":"project-uuid","holding_project_id":"holding-project-uuid"}}
{"configure_staking":{"validator":"testcorevaloper1..."}}
{"set_project_status":{"project_id":"project-uuid","status":"active"}}
```

The contract stores its native denomination at instantiate/migrate time: `utestcore` on testnet and `ucore` on mainnet. The current testnet deployment is code ID `3939` at `testcore18wsejajlp9flsdymm5j6xutuwkumrvg7twuz9rzwyf7cnq040fpqluslfg`. It keeps funds in its own account/staking delegation, rejects donations above the goal, and emits the event attributes used by the offline-replayable indexer:

- `action=donation_received`
- `project_id`
- `donor_address`
- `amount_microtx`

The frontend should wait for the wallet result, then the indexer should persist the confirmed transaction hash in Supabase.

`claim_project_funds` is beneficiary-only and succeeds only after the exact project goal is reached. If funds are staked, the first call starts undelegation and a later call after the seven-day period sends the balance to the beneficiary. After one year, `expire_project_funds` can move the funds to a contract-controlled holding project after the same unbonding delay.

## Query messages

```json
{"project":{"project_id":"project-uuid"}}
{"donor_total":{"project_id":"project-uuid","wallet_address":"core1..."}}
```

The production CosmWasm package should be tested against a local Coreum-compatible chain before testnet deployment. Keep the contract address in `VITE_COREUM_DONATION_CONTRACT` and never commit a private key. Coreum smart tokens are optional metadata references here; the CosmWasm contract is the custody layer.
