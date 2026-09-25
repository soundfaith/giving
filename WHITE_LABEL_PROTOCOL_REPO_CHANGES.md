# White-label Donation Protocol Repo Changes

## Purpose

This is the protocol repo change brief. It is meant to tell the agent what is missing or wrong in the current white-label donation protocol implementation before it is used by multiple partner platforms.

The `giving` app is only the first consumer. The protocol itself must be correct first.

## What is missing or incorrect

### 1. Project creation must not be open to any wallet
The protocol currently needs a proper allowlist / registry model.

A project should only be created if:
- the caller is an approved platform or partner admin
- the partner is KYB-approved or otherwise whitelisted
- the platform namespace is known and approved
- the beneficiary is valid and known
- the project ID is unique and namespaced

A random wallet should not be able to call `register_project` with arbitrary `platform_id` values or fake partner names.

### 2. Project IDs must be namespaced and unique across partners
The protocol should enforce a globally unique project pattern, for example:
- soundfaith:campaign-123
- partner-x:project-42

This avoids collisions across partner platforms and prevents spoofing.

### 3. Partner registry / allowlist is required
The protocol should have an approved partner registry with at least:
- partner ID
- active / inactive flag
- approved wallet(s)
- KYB status
- optional metadata

This registry must be checked before project creation is allowed.

### 4. Fee logic must be explicit, bounded, and consistent
The protocol needs a fixed fee model across partners, even if values differ by platform.

Required behavior:
- fee config must be stored on the project or platform config
- total fee must be capped
- payout formula must be deterministic
- protocol fee and platform fee must be visible in events / queries
- net payout must be calculated as gross minus all configured fees

### Fee calculation rule (decide now)
The fee must be deducted from the donation amount itself.

Formula:
- gross_donation = donor contribution
- protocol_fee = gross_donation * protocol_fee_bps / 10000
- platform_fee = gross_donation * platform_fee_bps / 10000
- beneficiary_payout = gross_donation - protocol_fee - platform_fee

This means the donor pays the full gross amount, and the fees are taken out before the beneficiary receives funds.

Example:
- donation: 100
- platform fee: 2%
- protocol fee: 1%
- total fee: 3%
- beneficiary receives: 97

Important: the total fee is not 2% + 5% applied on top of each other after payout. It is a shared deduction from the donation amount.

This also means our protocol commission can be based on the partner fee if desired, but the protocol should still define an explicit formula and cap. For example, the protocol may charge a percent of the platform fee rather than a separate percent of the donation, but that must be a documented, enforceable rule and not ad hoc.

### 5. The contract must be the source of truth
The protocol documentation should explicitly state:
- on-chain state is authoritative
- app databases, Supabase tables, and local counters are caches only
- partner apps must reconcile against contract queries after confirmation

### 6. Deployment secrets must stay out of runtime code
The mnemonic / deployment wallet should only be used for deployment or relayer operations.

It must not be exposed to:
- app runtime
- frontend code
- browser storage
- logs
- source control
- partner platform code

### 7. The protocol must be generic, not app-specific
The repo should not assume a single product, brand, or platform shape.

The protocol must be designed as a reusable shared contract layer that can serve many partner platforms with a common contract standard.

## What the protocol repo should change

The agent should update the protocol repo to add:
- partner registry / allowlist
- approved project creation guards
- project namespace + uniqueness enforcement
- fee config and payout validation
- explicit source-of-truth documentation
- deployment credential isolation guidance
- clear multi-platform integration docs

## Final instruction to the agent

Update the white-label donation protocol so it is safe for multiple partner platforms. It must support approved partner registration, KYB-based project creation, namespaced project IDs, explicit fee rules, and clear contract-as-source-of-truth behavior. Do not keep the protocol as a single app-specific donation contract. The protocol should be a generic shared white-label layer used by many partner platforms, while the `giving` app is only the first consumer.


This is the correct architecture for the production-ready white-label donation protocol.

## Migration audit: 2026-09-15

The shared Coreum testnet contract has now been upgraded in place and exposes the partner-gated ABI required by this brief.

Verified against the documented deployment address:
- `contract_status` responds with staking enabled and zero projects.
- `config` responds with the owner, denomination, fee configuration, and staking configuration.
- `partner_list` responds with an empty registry, confirming the partner registry query is live.
- The contract is now code ID `3950`, migrated from code ID `3948` by transaction `673968511EE7D65AC8942A5F6B1892E156F2D6CA90FC5FBDF3011822C5AAD52B`.
- The contract address is unchanged, so `giving` and future partners must continue using the documented shared address.

The registry is intentionally empty. A partner must be approved and registered by the protocol owner before any project can be created.

The giving application also remains incompatible with the documented protocol flow:
- the relayer sends the legacy `goal_micro_tx` and `metadata_token_id` project shape instead of `goal`, `metadata_uri`, `platform_id`, and `fee_bps`;
- Supabase project UUIDs are sent directly instead of deterministic namespaced IDs such as `soundfaith:<uuid>`;
- the indexer and Supabase Edge Function search for `action=donation_received`, while the protocol integration contract requires the canonical donation event schema to be verified and handled;
- the app's configured fallback contract address differs from the documented shared protocol address;
- the frontend has no complete refund, expiry, staking wait, or contract-state reconciliation flow.

Do not empty Supabase, seed new projects, or update/restart the Raspberry Pi relayer until the protocol ABI is upgraded, the app client/relayer/indexer are adapted, and one disposable end-to-end project passes registration, donation, overfunding rejection, expiry/refund, and claim tests.
