# White-label Donation Protocol Plan

## 1. Objective

We want to create a standalone white-label donation protocol that any platform can plug into without having to implement blockchain logic themselves.

The protocol should provide the core blockchain functionality for fundraising, while partner platforms focus on product UX, user onboarding, content, and business operations.

This project is not a one-off app. It is a reusable protocol layer meant to support many external platforms.

The long-term goal is:
- build a reusable smart-contract protocol
- deploy it on testnet
- validate it end-to-end
- remove our custom app-specific smart contracts from the current product
- rely on the white-label protocol as the shared blockchain layer

## 2. Product vision

Any partner platform should be able to integrate with the protocol without needing to understand on-chain custody or contract messaging.

Examples:
- church donation portal
- nonprofit fundraising app
- community campaign platform
- social donation experience
- GoFundMe-style partner product

A platform should be able to:
- create campaigns/projects on the protocol
- configure beneficiary and goal metadata
- accept donations from wallet users
- track project status
- retrieve donation totals and project state
- optionally receive a commission or fee share

The smart contract handles the actual funding rules, custody, and payout logic.

## 3. Major design principle

We need to separate the system into clear layers:

### Layer 1: Contract protocol
This is the blockchain layer.

Responsibilities:
- registration of projects
- donation intake
- escrow custody
- funding goal enforcement
- release conditions for payouts
- handling of expired/failed campaigns
- pause and emergency controls
- fee accounting and commission routing

### Layer 2: Indexer / backend API
This is the application integration layer.

Responsibilities:
- watch chain events
- map on-chain transactions to project IDs
- provide UI-friendly data
- serve donation totals and status
- power platform dashboards and admin screens
- provide a clean API for external systems

### Layer 3: Partner platform
This is the client-facing experience.

Responsibilities:
- content and user journey
- marketing and acquisition
- project presentation
- wallet onboarding
- donor UX
- business operations and compliance

This separation is essential for a white-label design.

## 4. Why funds should remain in escrow

The safest and most appropriate model for donation fundraising is escrow custody.

Donors should send funds to the smart contract, not directly to the beneficiary.

That allows the contract to guarantee:
- the funds are only released under valid rules
- a campaign only pays out if funded or eligible
- donation logic is transparent and auditable
- partner platforms do not manage custody directly

### Recommended behavior
- Donor sends funds to the contract.
- Donation is recorded by project.
- Project raises funds toward goal.
- If the campaign reaches its funding target, beneficiary can claim under contract rules.
- If the project fails or expires, the contract follows a defined fallback rule.

### Why not direct payout?
Direct payout before goal completion creates risk and weakens the protocol design. A donation protocol should enforce fundraising logic, not rely on external trust.

## 5. Serious contract model

This should be designed like a reusable infrastructure primitive, not a custom app contract.

The contract should support:
- project creation
- donation storage
- goal tracking
- payout eligibility checks
- expiration handling
- pause controls
- fee routing
- donor tracking
- stable event output for indexers

It should be portable across many product use cases.

## 6. Project requirements for the new repo

The next project should be a clean standalone Rust + CosmWasm repository containing only the smart contracts and deployment support, not a full frontend product.

### The repo should contain:
- Rust contract(s)
- Rust unit/integration tests
- deploy scripts
- migration scripts
- query scripts
- basic contract specification docs
- security notes
- deployment notes

### It should not contain:
- a custom product dashboard
- app-specific UI logic
- hard-coded business or church features
- custom project-specific assumptions

This is a protocol repo, not a product repo.

## 7. Core white-label use case

A white-label platform should be able to do the following:

1. Create a project on the protocol.
2. Provide required fields such as:
   - project ID
   - beneficiary address
   - goal amount
   - metadata reference
   - optional platform ID
   - optional fee config
3. Let donor wallets contribute native funds.
4. Track project status and totals from the contract or indexer.
5. Release funds only under valid rules.

The protocol should be generic enough to support many platform integrations without needing separate contract deployments for each platform.

## 8. Recommended contract behavior

### 8.1 Project registration
Project should contain at least:
- id
- beneficiary address
- funding goal
- metadata reference
- status
- optional project expiration
- optional platform ID
- optional fee settings

### 8.2 Donation flow
- accept only valid native funds
- reject invalid or unexpected funds
- update project raised amount
- update donor totals
- emit canonical donation event

### 8.3 Funding completion
When raised amount reaches or exceeds the goal:
- project is considered funded
- beneficiary can later claim
- funds remain in escrow until release

### 8.4 Claim flow
Claim should be allowed only when:
- the sender is the beneficiary
- the project is eligible for release
- the goal was reached
- the campaign is not expired or blocked

### 8.5 Expiry / failure flow
If a project fails or expires:
- the contract should follow a precise rule
- direct arbitrary payout should be blocked
- refund or fallback logic must be explicit

### 8.6 Pause functionality
The contract should allow the owner to pause the protocol in case of emergency.

## 9. Commission model

We want to keep fees low and competitive.

The fee model must be explicit and deducted from the donation amount itself, not added on top after payout.

Required rule:
- donor sends gross donation amount
- protocol fee is calculated as gross donation * fee_bps / 10000
- platform fee is calculated as gross donation * fee_bps / 10000
- net payout to beneficiary = gross donation - protocol fee - platform fee

Recommended policy for MVP:
- platform fee: 0% to 2%
- protocol fee: 0% to 1%
- configurable per partner or campaign
- zero-fee mode for strategic adoption

This should be maintained because the value proposition is infrastructure adoption, not heavy extraction.

The protocol should support:
- percentage-based fees
- basis-point configuration
- total-fee cap enforcement
- explicit treasury routing
- clear beneficiary net payout calculation

Example:
- donation = 100
- platform fee = 2%
- protocol fee = 1%
- total fee = 3%
- beneficiary receives = 97

This is the fixed rule. The protocol must not compute fees as a separate amount added after the beneficiary payout is determined.

## 10. Wallet policy and compliance plan

### MVP policy
For MVP and early testnet, we should allow any wallet.

This is acceptable because:
- we need to validate protocol behavior
- we need to avoid delaying product development
- compliance review is a later phase

### Later policy
Once the MVP is stable, we can integrate:
- KYB/KYC checks at platform level
- wallet allowlists for approved partners
- platform or compliance gating before a user can create or manage campaigns

The contract itself should not be responsible for doing all compliance enforcement unless absolutely required.

## 11. Security model

This is a serious project and should be designed with auditability in mind.

### Required protections
- admin rights must be limited
- owner should be a multisig or governance account
- contract should support emergency pause
- no arbitrary transfer of donor funds
- payout rules must be strict and deterministic
- state transitions should be explicit and easy to audit

### Risk areas to review
- authorization boundaries
- asset custody logic
- refund/expiry handling
- goal validation
- fee accounting
- emergency controls
- migration safety
- upgrade strategy

This project should later be reviewed by a qualified smart contract auditor before production deployment.

## 12. Recommended contract API

### InstantiateMsg
```rust
InstantiateMsg {
    native_denom: String,
    owner: String,
    protocol_fee_bps: Option<u64>,
    default_platform_fee_bps: Option<u64>,
    paused: Option<bool>,
    projects: Vec<ProjectInit>
}
```

### ProjectInit
```rust
ProjectInit {
    id: String,
    beneficiary: String,
    goal_micro_tx: Uint128,
    status: ProjectStatus,
    metadata_token_id: Option<String>,
    platform_id: Option<String>,
    fee_bps: Option<u64>,
    expires_at: Option<u64>
}
```

### ExecuteMsg
```rust
ExecuteMsg::RegisterProject { project: ProjectInit }
ExecuteMsg::Donate { project_id: String }
ExecuteMsg::ClaimProjectFunds { project_id: String }
ExecuteMsg::ExpireProjectFunds { project_id: String }
ExecuteMsg::SetProjectStatus { project_id: String, status: ProjectStatus }
ExecuteMsg::SetPaused { paused: bool }
ExecuteMsg::ConfigurePlatform { platform_id: String, fee_bps: u64, treasury: String }
```

### QueryMsg
```rust
QueryMsg::Project { project_id: String }
QueryMsg::DonorTotal { project_id: String, wallet_address: String }
QueryMsg::ContractStatus {}
QueryMsg::PlatformConfig { platform_id: String }
```

### Status values
```rust
ProjectStatus::Draft
ProjectStatus::Active
ProjectStatus::Funded
ProjectStatus::Expired
ProjectStatus::Closed
ProjectStatus::Refunded
ProjectStatus::Paused
```

## 13. Data model requirements

The contract should store:
- owner
- paused flag
- native denom
- project map
- donor totals map
- platform config map
- fee config
- optional treasury wallet

Project state should include:
- id
- beneficiary
- goal amount
- raised amount
- donor count
- status
- metadata reference
- created timestamp
- claim timestamp
- expiry timestamp
- optional refund state

## 14. Event model

The contract should emit consistent events for external indexing.

Suggested attributes:
- action
- project_id
- donor_address
- amount_microtx
- beneficiary
- status
- fee_amount_microtx
- platform_id

This is important because external platform apps will need a predictable event schema.

## 15. Recommended implementation phases

### Phase 1: Core contract foundation
- create standalone Rust / CosmWasm repo
- define state model
- implement instantiation
- define project and donor records
- add donation logic
- add query support

### Phase 2: Funding and release logic
- enforce goal logic
- implement claim rules
- define project lifecycle states
- add expiry/failure handling
- ensure only valid beneficiary can claim

### Phase 3: Fee logic
- add fee configuration
- add treasury or commission routing
- compute net payout
- expose fee queries

### Phase 4: White-label support
- add partner metadata support
- define event schema for platform integrations
- provide clean docs for third-party developers
- specify API usage pattern for any platform

### Phase 5: Compliance readiness
- document KYB/KYC workflow
- define wallet allowlist strategy
- prepare partner onboarding and risk controls

### Phase 6: Testnet deployment
- deploy to testnet
- validate all flows
- confirm event ingestion and indexing
- migrate away from current app-specific chain logic

## 16. Deployment requirements for the new project

The agent that creates the project must use the wallet mnemonic from the Windows Credential Manager to deploy the smart contract.

This requirement is mandatory.

### Why
We need to deploy contracts from the secure developer wallet stored in Windows Credential Manager rather than embedding a private key directly into the project. This is safer and aligns with production discipline.

### Required instruction to the agent
When it sets up deployment scripts or deployment flows, it must:
- read the wallet mnemonic from the Windows Credential Manager
- use that value in the deployment script or env setup
- avoid committing private keys to the repository
- document the exact credential source and how to configure it for a new machine

The deployment documentation should explain how to retrieve the mnemonic from Windows Credential Manager and inject it into the environment for deployment.

## 17. Documentation requirement for any platform integration

Once the protocol is built and deployed, it must provide clear documentation so any platform can integrate without reverse-engineering the smart contract.

The documentation should include:
- how a partner creates a project
- how a donor sends funds
- how a platform reads project state
- how claim/release logic works
- what events are emitted
- how to read donation data from the indexer
- how to map partner IDs to project IDs
- how to handle fees and payouts
- how to query donor totals and project status
- examples of contract calls and responses
- examples of frontend integration flow

### Integration documentation should include:
- step-by-step partner onboarding flow
- recommended contract call sequence
- sample JSON payloads
- event examples
- indexer API examples
- failure and refund scenarios
- operational monitoring guidance

This is essential because a white-label protocol only works if external platforms can integrate without custom blockchain expertise.

## 18. Recommended final prompt for the agent

Use this prompt when creating the new project in a fresh workspace:

Create a new standalone Rust/CosmWasm smart-contract repository for a white-label donation protocol. This project must be reusable by any partner platform and must not be tied to a single app or brand. Implement a minimal but production-oriented donation contract that supports project registration, donation acceptance, funding goal validation, beneficiary payout release, pause controls, failure or expiry handling, and configurable fee logic. The contract should operate as an escrow-based custody layer with project records, donor totals, stable event outputs, and clean query support. Include deployment scripts, migration support, and testing docs. Use the wallet mnemonic from the Windows Credential Manager for deployment so the project does not embed a private key. The documentation must explain how any external platform can integrate with the protocol, including project creation, donation flows, state queries, fees, events, and payout logic. The design should be generic enough to support multiple white-label platforms and should plan for future compliance enforcement via KYB/KYC or wallet allowlists. This protocol is intended to replace the current custom donation smart contracts once it has been deployed and validated on testnet.

## 19. Final implementation direction

The protocol should be designed as a reusable blockchain primitive, not as a product-specific app.

The smart contract is the trust layer. The indexer is the integration layer. The partner platform is the user-facing layer.

That architecture is the right foundation for a serious white-label donation protocol.

## 20. Final objective

The final outcome should be:
- a reusable donation protocol repo
- clean contract design
- secure deployment workflow using Windows Credential Manager mnemonic
- clear and complete documentation for any partner platform to integrate
- a path to testnet deployment and future migration away from the custom app contracts

This is the correct end state for the project.
