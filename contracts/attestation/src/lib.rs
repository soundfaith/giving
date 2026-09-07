use cosmwasm_schema::{cw_serde, QueryResponses};
use cosmwasm_std::{entry_point, to_json_binary, Deps, DepsMut, Env, MessageInfo, Response, Uint128};
use cw2::set_contract_version;
use cw_storage_plus::{Item, Map};
use thiserror::Error;

const CONTRACT_NAME: &str = "soundfaith-attestation";
const CONTRACT_VERSION: &str = env!("CARGO_PKG_VERSION");
const OWNER: Item<String> = Item::new("owner");
const PROJECTS: Map<&str, ProjectState> = Map::new("projects");
const REVIEWERS: Map<&str, ReviewerState> = Map::new("reviewers");
const ATTESTATIONS: Map<(&str, &str), Attestation> = Map::new("attestations");

#[cw_serde]
pub struct InstantiateMsg {}

#[cw_serde]
pub struct ProjectInit { pub id: String, pub goal_tx: Uint128, pub parish_signature: String }

#[cw_serde]
pub struct ReviewerInit { pub wallet: String, pub kyc_status: String, pub applicant_type: String }

#[cw_serde]
pub enum ProjectStatus { PendingAttestation, Active, Paused, Rejected }

#[cw_serde]
pub struct ProjectState {
    pub goal_tx: Uint128,
    pub required_attestations: u32,
    pub required_weighted_score: u32,
    pub status: ProjectStatus,
    pub parish_signature: String,
    pub attestations: u32,
    pub flags: u32,
    pub weighted_score: u32,
}

#[cw_serde]
pub struct ReviewerState { pub reputation: i32, pub kyc_status: String, pub applicant_type: String }

#[cw_serde]
pub enum AttestationDecision { Attest, Flag }

#[cw_serde]
pub struct Attestation { pub reviewer: String, pub decision: AttestationDecision, pub reputation: i32 }

#[cw_serde]
pub enum ExecuteMsg {
    RegisterProject { project: ProjectInit },
    RegisterReviewer { reviewer: ReviewerInit },
    SubmitAttestation { project_id: String, decision: AttestationDecision },
    AdminOverride { project_id: String, status: ProjectStatus },
}

#[cw_serde]
#[derive(QueryResponses)]
pub enum QueryMsg {
    #[returns(ProjectResponse)] Project { project_id: String },
    #[returns(ReviewerResponse)] Reviewer { wallet: String },
    #[returns(AttestationResponse)] Attestation { project_id: String, wallet: String },
}

#[cw_serde]
pub struct ProjectResponse { pub project: ProjectState }
#[cw_serde]
pub struct ReviewerResponse { pub reviewer: ReviewerState }
#[cw_serde]
pub struct AttestationResponse { pub attestation: Option<Attestation> }

#[derive(Error, Debug, PartialEq)]
pub enum ContractError {
    #[error("standard error: {0}")] Std(#[from] cosmwasm_std::StdError),
    #[error("only the contract owner can perform this action")] Unauthorized,
    #[error("project already exists")] ProjectAlreadyExists,
    #[error("project is not accepting attestations")] ProjectNotOpen,
    #[error("reviewer is not KYB/KYC approved")] ReviewerNotApproved,
    #[error("reviewer has already decided on this project")] AlreadyAttested,
    #[error("project was not found")] ProjectNotFound,
}

#[entry_point]
pub fn instantiate(deps: DepsMut, _env: Env, info: MessageInfo, _msg: InstantiateMsg) -> Result<Response, ContractError> {
    set_contract_version(deps.storage, CONTRACT_NAME, CONTRACT_VERSION)?;
    OWNER.save(deps.storage, &info.sender.to_string())?;
    Ok(Response::new().add_attribute("action", "instantiate"))
}

#[entry_point]
pub fn execute(deps: DepsMut, _env: Env, info: MessageInfo, msg: ExecuteMsg) -> Result<Response, ContractError> {
    match msg {
        ExecuteMsg::RegisterProject { project } => { ensure_owner(deps.storage, &info)?; if PROJECTS.has(deps.storage, &project.id) { return Err(ContractError::ProjectAlreadyExists); } let required = required_attestations(project.goal_tx); PROJECTS.save(deps.storage, &project.id, &ProjectState { goal_tx: project.goal_tx, required_attestations: required, required_weighted_score: required * 4, status: ProjectStatus::PendingAttestation, parish_signature: project.parish_signature, attestations: 0, flags: 0, weighted_score: 0 })?; Ok(Response::new().add_attribute("action", "project_registered")) }
        ExecuteMsg::RegisterReviewer { reviewer } => { ensure_owner(deps.storage, &info)?; REVIEWERS.save(deps.storage, &reviewer.wallet, &ReviewerState { reputation: 1, kyc_status: reviewer.kyc_status, applicant_type: reviewer.applicant_type })?; Ok(Response::new().add_attribute("action", "reviewer_registered")) }
        ExecuteMsg::SubmitAttestation { project_id, decision } => submit_attestation(deps, info, project_id, decision),
        ExecuteMsg::AdminOverride { project_id, status } => { ensure_owner(deps.storage, &info)?; let mut project = PROJECTS.may_load(deps.storage, &project_id)?.ok_or(ContractError::ProjectNotFound)?; project.status = status; PROJECTS.save(deps.storage, &project_id, &project)?; Ok(Response::new().add_attribute("action", "admin_override")) }
    }
}

fn submit_attestation(deps: DepsMut, info: MessageInfo, project_id: String, decision: AttestationDecision) -> Result<Response, ContractError> {
    let wallet = info.sender.to_string();
    let reviewer = REVIEWERS.may_load(deps.storage, &wallet)?.ok_or(ContractError::ReviewerNotApproved)?;
    if reviewer.kyc_status != "approved" || reviewer.applicant_type != "individual" { return Err(ContractError::ReviewerNotApproved); }
    if ATTESTATIONS.has(deps.storage, (&project_id, &wallet)) { return Err(ContractError::AlreadyAttested); }
    let mut project = PROJECTS.may_load(deps.storage, &project_id)?.ok_or(ContractError::ProjectNotFound)?;
    if !matches!(project.status, ProjectStatus::PendingAttestation | ProjectStatus::Paused) { return Err(ContractError::ProjectNotOpen); }
    let is_flag = matches!(decision, AttestationDecision::Flag);
    if is_flag { project.flags += 1; project.status = ProjectStatus::Paused; } else { project.attestations += 1; project.weighted_score = project.weighted_score.saturating_add(reviewer.reputation.max(0) as u32); }
    ATTESTATIONS.save(deps.storage, (&project_id, &wallet), &Attestation { reviewer: wallet.clone(), decision, reputation: reviewer.reputation })?;
    if project.flags == 0 && project.attestations >= project.required_attestations && project.weighted_score >= project.required_weighted_score { project.status = ProjectStatus::Active; }
    PROJECTS.save(deps.storage, &project_id, &project)?;
    Ok(Response::new().add_attribute("action", if is_flag { "flag" } else { "attest" }))
}

fn required_attestations(goal_tx: Uint128) -> u32 { (5u32.saturating_add((goal_tx / Uint128::new(10_000)).u128() as u32)).min(30) }
fn ensure_owner(storage: &dyn cosmwasm_std::Storage, info: &MessageInfo) -> Result<(), ContractError> { if OWNER.load(storage)? != info.sender.to_string() { Err(ContractError::Unauthorized) } else { Ok(()) } }

#[entry_point]
pub fn query(deps: Deps, _env: Env, msg: QueryMsg) -> Result<cosmwasm_std::Binary, ContractError> {
    match msg { QueryMsg::Project { project_id } => to_json_binary(&ProjectResponse { project: PROJECTS.load(deps.storage, &project_id)? }).map_err(Into::into), QueryMsg::Reviewer { wallet } => to_json_binary(&ReviewerResponse { reviewer: REVIEWERS.load(deps.storage, &wallet)? }).map_err(Into::into), QueryMsg::Attestation { project_id, wallet } => to_json_binary(&AttestationResponse { attestation: ATTESTATIONS.may_load(deps.storage, (&project_id, &wallet))? }).map_err(Into::into) }
}