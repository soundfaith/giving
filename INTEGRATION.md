# Partner Integration

The shared white-label protocol is deployed on Coreum testnet. All partner platforms, including the first `giving` integration, use this single contract; partner platforms do not deploy a separate donation contract.

```text
Contract: testcore184vcst03q9p540al5jw3pytjprn7mlr456w9xh0th5awgeyvf3wqz8d8mr
Explorer: https://explorer.testnet-1.tx.org/tx/accounts/testcore184vcst03q9p540al5jw3pytjprn7mlr456w9xh0th5awgeyvf3wqz8d8mr
Chain ID: coreum-testnet-1
RPC: https://rpc.testnet-1.tx.org:443
Native denom: utestcore
Code ID: 3950
```

The protocol was instantiated with an empty project registry. The `giving` application registers its approved projects through the protocol owner/relayer and then uses the same shared address for donations, queries, claims, expiry, and refunds.

The original code ID `3948` was migrated in place to code ID `3950` with the `"from_v010"` migration message. The contract address did not change.

The protocol has three layers: this contract is the custody layer, an indexer/backend translates chain events into an API, and a partner platform provides the donor and project experience. Project IDs should be globally unique and can encode a partner namespace, for example `partner-a:campaign-42`; the contract does not interpret that string. The contract is the source of truth. App databases, Supabase tables, and local counters are caches that must reconcile against `project`, `partner`, and `contract_status` queries after confirmation.

Partner onboarding is explicit: the owner registers a partner ID, marks it active and KYB-approved, and enumerates approved admin wallets. A project can only be created by one of those approved wallet addresses, and the ID must start with `partner_id:` to prevent spoofing or collisions across namespaces.

## Local explorer preview

The read-only UI under the ui folder is a static frontend and does not start itself. It only loads when a local web server is running and serving the ui directory. If you open the page without a server, the browser will not load the scripts and data because nothing is bound to localhost:8080.

From the repository root, start it with:

```powershell
python -m http.server 8080 --directory ui
```

Then open:

```text
http://localhost:8080/
```

If the command is run from a different folder, or if the ui directory is not the directory being served, the page will appear blank or fail to load even though the file exists.

## 1. Instantiate once per custody domain

```json
{
  "native_denom": "uatom",
  "owner": "juno1multisig...",
  "protocol_fee_bps": 50,
  "default_platform_fee_bps": 50,
  "protocol_treasury": "juno1treasury...",
  "paused": false,
  "projects": []
}
```

Use a multisig or governance address as `owner`. A fee of 100 basis points is 1%; the contract rejects a protocol plus default platform fee above 100 basis points.

Staking is optional and disabled when `staking` is omitted. On a chain with staking support it may be enabled at instantiation with:

```json
{
  "staking": {
    "enabled": true,
    "validator": "corevaloper1...",
    "unbonding_seconds": 604800
  }
}
```

The owner can change the adapter later with `configure_staking`. Setting `enabled` to `false` stops delegation for future donations; it does not cancel or rewrite funds already delegated. Those projects continue through `unstaking` and the configured unbonding period before payout.

## 2. Register a partner and create an approved project

The owner first registers an approved partner:

```json
{
  "register_partner": {
    "partner": {
      "id": "partner-a",
      "active": true,
      "kyb_approved": true,
      "approved_wallets": ["core1admin..."],
      "metadata": "approved partner"
    }
  }
}
```

A platform should persist its own partner ID alongside the on-chain `id`. Only an approved wallet for that partner can create a project, and the project ID must be namespaced as `partner-a:<slug>`.

```json
{
  "register_project": {
    "project": {
      "id": "partner-a:campaign-42",
      "beneficiary": "juno1beneficiary...",
      "goal": "1000000",
      "metadata_uri": "ipfs://...",
      "platform_id": "partner-a",
      "fee_bps": 25,
      "expires_at": 1760000000,
      "status": "active"
    }
  }
}
```

The initial status may be `draft` or `active`. An owner can later switch between those two states with `set_project_status`; `funded`, `expired`, and `closed` are contract-derived states.

## 3. Accept a donation

The wallet must attach exactly one non-zero coin in the configured denomination:

```json
{
  "donate": { "project_id": "partner-a:campaign-42" }
}
```

When `raised >= goal`, the project becomes `funded`. Query `project`, `donor_total`, and `contract_status` after confirmation rather than inferring state from the submitted transaction.

## 4. Claim or refund

The beneficiary calls `claim_project_funds` only after funding. With staking disabled, the contract computes protocol fee, platform fee, and beneficiary net amount, then emits bank sends in the same transaction. With staking enabled for that donation, the first call emits an undelegation and changes the project to `unstaking`; the beneficiary calls the same message again after `unbonding_seconds` to release the net payout. It never accepts a beneficiary-supplied payout amount.

If the expiry timestamp is reached, the owner or beneficiary calls `expire_project_funds`. Each donor then calls `refund_donation`; the refund is the donor's gross recorded contribution and cannot be claimed twice.

## Query examples

```json
{ "project": { "project_id": "partner-a:campaign-42" } }
{ "donor_total": { "project_id": "partner-a:campaign-42", "wallet_address": "juno1donor..." } }
{ "project_list": { "start_after": null, "limit": 30 } }
```

## Canonical events

Every execute response includes `action`. Donation responses include `project_id`, `donor_address`, `amount_microtx`, `beneficiary`, and `status`. Claim responses include `project_id`, `beneficiary`, `amount`, `fee_amount_microtx`, and `status`. Expiry/refund/status/configuration actions include their affected ID. Indexers should key on transaction hash plus event attributes and tolerate additional attributes in future versions.

## Recommended platform sequence

1. Complete platform KYB/KYC and beneficiary review off-chain.
2. Register a unique project ID and store the transaction hash.
3. Index the project event and expose only confirmed state to users.
4. Generate a wallet transaction for `donate` with the exact native denom.
5. Monitor project, donation, status, and bank events from the chain.
6. After `funded`, notify the beneficiary to claim. If the project becomes `unstaking`, wait for the configured chain unbonding period and submit the claim again. After `expired`, notify donors to refund.
7. Reconcile contract queries against the indexer periodically.

The MVP permits any wallet. A future version can gate project creation or donation with allowlists, verified platform registries, or compliance modules; those policies should be introduced through an audited migration rather than hidden in a partner backend.
