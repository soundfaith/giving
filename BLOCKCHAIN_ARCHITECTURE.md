# SoundFaith Blockchain Architecture

## Executive summary

SoundFaith currently uses one deployed CosmWasm donation-vault contract for project custody and donations.

The Coreum wallet address is the durable owner and beneficiary identifier for funds. Supabase user IDs and emails are application identity and moderation data; they are not the destination for project funds.

The current project workflow has two stages:

1. A church submits a project to Supabase with its active wallet address.
2. After review approval, the admin registers that project on the donation contract with the saved wallet as `beneficiary`.

The beneficiary is therefore fixed on-chain when registration occurs, before donations are accepted.

## Contracts and tokens

### 1. SoundFaith donation-vault contract

The active testnet contract is:

`testcore18wsejajlp9flsdymm5j6xutuwkumrvg7twuz9rzwyf7cnq040fpqluslfg`

It was deployed as code ID `3939` on `coreum-testnet-1`.

This contract:

- Stores project IDs and project state
- Stores each project's goal and raised amount
- Stores the beneficiary wallet address
- Accepts native `utestcore` donations
- Tracks donor totals and donor count
- Delegates donations to the configured validator immediately
- Undelegates when the beneficiary starts a claim
- Releases funds to the beneficiary after the validator's unbonding period
- Restricts project registration and staking configuration to the contract owner
- Restricts claims to the stored project beneficiary

The contract does not store email addresses, Supabase user IDs, names, chat messages, or private keys.

## Custody safety

Holding donations in the donation-vault contract is the appropriate custody model for this workflow. The contract is the only component that can accept donations, stake them, enforce the recorded beneficiary, and execute the release rules.

The metadata Smart Token should not hold donations. It is a reference/label asset and does not provide the authorization, accounting, or claim controls required for project funds.

Using one vault contract for many projects is acceptable when its authorization and accounting are thoroughly audited. A separate contract per project could isolate failures, but it would multiply deployment, migration, administration, and security-review costs. The current design uses one vault with project IDs and per-project beneficiary state.

### 2. Optional Coreum metadata Smart Token

A metadata token may be issued separately with the token scripts. It is a label or project reference only.

It does not hold donated funds.

The donation vault holds and stakes native `utestcore`. The metadata token is not involved in donation custody, staking, unstaking, or claiming.

### How many contracts are involved?

For donation custody, one SoundFaith CosmWasm contract is involved: the donation vault.

Coreum's validator and staking module are chain-level functionality used by the vault's staking messages. They are not SoundFaith contracts.

If a metadata Smart Token is issued, that token is a separate Coreum token asset, not another SoundFaith donation contract.

## Project creation flow

### Step 1: User submits a project

The church user signs in and must have an active local wallet.

The app stores the project in Supabase with:

- Project details
- `submitted_by`: the Supabase auth user ID, used for dashboard ownership and moderation
- `owner_wallet_address`: the wallet address captured at submission
- Review status, initially `review`
- Optional image URLs

The wallet address is now captured independently from the login identity. If the user deletes the profile later, the wallet address recorded on the project remains the project beneficiary reference.

### Step 2: Review approval

The admin approval flow reads `owner_wallet_address` from the project. It uses that address as the on-chain `beneficiary` during registration.

The admin signer pays the registration transaction fee and calls:

```json
{
  "register_project": {
    "project": {
      "id": "project-id",
      "goal_micro_tx": "...",
      "status": "active",
      "metadata_token_id": "...",
      "beneficiary": "testcore1..."
    }
  }
}
```

The contract validates and stores the beneficiary address. From this point, the destination of a claim is determined by blockchain state, not by Supabase or the user's email.

### Important timing detail

The current system does not register projects on-chain at the instant the user submits the form. It submits to Supabase first so the review process can approve or reject it.

The owner wallet is captured immediately in Supabase, and it is written on-chain when the approved project is registered. Donations should only be accepted after that registration and activation.

## What is stored on-chain for a project?

The contract stores a `ProjectState` containing:

- `goal_micro_tx`
- `raised_micro_tx`
- `donor_count`
- `status`
- `metadata_token_id`
- `beneficiary`
- `staked_micro_tx`

The contract also stores donor totals keyed by:

```text
(project_id, donor_wallet_address)
```

No private key is stored on-chain. No email or Supabase user ID is stored on-chain.

## Donation flow

A donor signs a transaction from a Coreum wallet. The transaction sends native `utestcore` to the donation contract and executes:

```json
{
  "donate": {
    "project_id": "project-id"
  }
}
```

The contract checks:

- The project is active
- Exactly one coin was sent
- The denom is the configured native denom
- The amount is greater than zero
- The donation does not exceed the goal

The contract then:

1. Increases `raised_micro_tx`
2. Increases the donor's total for that project
3. Increases `donor_count` for a first-time donor
4. Changes status to `funded` when the exact goal is reached
5. Delegates the donated amount to the configured validator immediately

The donation does not go to a user's Supabase account and does not go to a metadata token. It is handled by the donation-vault contract and then delegated through Coreum staking.

Supabase's indexer watches the transaction event and records a ledger copy containing the project ID, donor wallet, amount, transaction hash, and timestamp. Supabase is a reporting/indexing layer; the contract remains the custody source of truth.

## Staking and claim flow

### During donations

Once the validator is configured, every accepted donation immediately creates a staking delegation message. The contract tracks the delegated amount in `staked_micro_tx`.

### When fully funded

The project becomes `funded` when `raised_micro_tx` reaches `goal_micro_tx`.

The owner wallet can then claim. The owner-only UI is enabled only when the connected local wallet matches the on-chain beneficiary.

### First claim

The beneficiary calls:

```json
{
  "claim_project_funds": {
    "project_id": "project-id"
  }
}
```

If the project is staked, the contract sends an undelegation message to the configured validator and changes the project status to `unstaking`.

### Second claim

After Coreum's validator unbonding period, currently seven days for the testnet validator used by this project, the beneficiary calls the same claim message again.

The contract then sends the native funds to the stored `beneficiary` wallet using a bank send message.

The application does not run a timer to release funds. The chain controls the unbonding period. The owner simply returns and submits the claim again after the period has completed.

## One-year beneficiary expiration

When a donation brings a project exactly to its goal, the contract records:

- `funded_at`
- `claim_expires_at`, set to one year later

After the deadline, anyone can call `ExpireProjectFunds` with a designated holding-project ID. This does not send money to the admin or to the holding project's beneficiary.

If the expired project is staked, the first expiration call undelegates it. The contract requires the seven-day unbonding period to pass. A second expiration call then moves the amount into contract-controlled holding-project accounting and marks the original project `expired`.

This intentionally postpones the policy decision about donor refunds or redistribution. A later audited contract upgrade can authorize a specific holding-project release, donor pro-rata refunds, or distribution to other projects.

The expiration feature must be deployed through a contract migration before it affects an already deployed contract. Existing funded projects created before the upgrade do not have a recorded funding timestamp and should be handled explicitly during migration rather than assumed eligible for automatic expiration.

## Wallet and login model

- Social login identifies the application user.
- The wallet address identifies the blockchain owner.
- Encrypted wallet material stays in the browser's IndexedDB.
- Supabase stores wallet addresses for account continuity and project references.
- The active wallet on a device is selected locally and the last selected wallet is reused automatically.
- Multiple named wallets can exist on one device.
- A project stores its owner wallet address separately from `submitted_by`.

Deleting a Supabase profile does not change the beneficiary stored on-chain. It also does not change the wallet address stored on the project row.

## What is not happening

- The metadata token is not receiving donations.
- Email is not the recipient of funds.
- A Supabase user ID is not the on-chain beneficiary.
- The app server does not custody private keys.
- The app does not control the seven-day unbonding timer.
- A project cannot claim to an arbitrary wallet after registration; the contract checks the stored beneficiary.

## Operational references

Relevant implementation files:

- `contracts/donation/src/lib.rs`: CosmWasm vault contract
- `src/lib/wallet.ts`: wallet transactions and contract queries
- `src/lib/churches.ts`: project submission and owner wallet capture
- `src/pages/AdminPage.tsx`: review approval and on-chain registration
- `scripts/coreum-indexer.ts`: transaction event indexing
- `supabase/migrations/010_project_owner_wallet.sql`: project owner wallet schema and admin RPC
