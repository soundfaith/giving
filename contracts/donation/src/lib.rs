use cosmwasm_schema::{cw_serde, QueryResponses};
use cosmwasm_std::{entry_point, to_json_binary, BankMsg, Coin, CosmosMsg, Deps, DepsMut, Env, MessageInfo, Response, StakingMsg, StdResult, Uint128};
use cw_storage_plus::{Item, Map};
use cw2::set_contract_version;
use thiserror::Error;

const CONTRACT_NAME: &str = "soundfaith-donation";
const CONTRACT_VERSION: &str = env!("CARGO_PKG_VERSION");

#[cw_serde]
pub struct InstantiateMsg {
    pub native_denom: String,
    pub projects: Vec<ProjectInit>,
}

#[cw_serde]
pub struct MigrateMsg {
    pub native_denom: String,
}

#[cw_serde]
pub struct ProjectInit {
    pub id: String,
    pub goal_micro_tx: Uint128,
    pub status: ProjectStatus,
    pub metadata_token_id: String,
    pub beneficiary: String,
}

#[cw_serde]
pub enum ProjectStatus {
    Draft,
    Active,
    Funded,
    Unstaking,
    Expiring,
    Expired,
    Closed,
}

#[cw_serde]
pub enum ExecuteMsg {
    Donate { project_id: String },
    ClaimProjectFunds { project_id: String },
    ExpireProjectFunds { project_id: String, holding_project_id: String },
    ConfigureStaking { validator: String },
    RegisterProject { project: ProjectInit },
    SetProjectStatus { project_id: String, status: ProjectStatus },
    UpdateProjectMetadata { project_id: String, metadata_token_id: String },
    SetPaused { paused: bool },
}

#[cw_serde]
#[derive(QueryResponses)]
pub enum QueryMsg {
    #[returns(ProjectResponse)]
    Project { project_id: String },
    #[returns(DonorTotalResponse)]
    DonorTotal { project_id: String, wallet_address: String },
    #[returns(ContractStatusResponse)]
    ContractStatus {},
}

#[cw_serde]
pub struct ProjectResponse {
    pub id: String,
    pub goal_micro_tx: Uint128,
    pub raised_micro_tx: Uint128,
    pub donor_count: u64,
    pub status: ProjectStatus,
    pub metadata_token_id: String,
    pub beneficiary: String,
    pub staked_micro_tx: Uint128,
    pub funded_at: Option<u64>,
    pub claim_expires_at: Option<u64>,
    pub unstaking_started_at: Option<u64>,
}

#[cw_serde]
pub struct DonorTotalResponse {
    pub project_id: String,
    pub wallet_address: String,
    pub amount_micro_tx: Uint128,
}

#[cw_serde]
pub struct ContractStatusResponse {
    pub paused: bool,
    pub version: String,
}

#[cw_serde]
pub struct ProjectState {
    pub goal_micro_tx: Uint128,
    pub raised_micro_tx: Uint128,
    pub donor_count: u64,
    pub status: ProjectStatus,
    pub metadata_token_id: String,
    pub beneficiary: String,
    #[serde(default)]
    pub staked_micro_tx: Uint128,
    #[serde(default)]
    pub funded_at: Option<u64>,
    #[serde(default)]
    pub claim_expires_at: Option<u64>,
    #[serde(default)]
    pub unstaking_started_at: Option<u64>,
}

const OWNER: Item<String> = Item::new("owner");
const PAUSED: Item<bool> = Item::new("paused");
const NATIVE_DENOM: Item<String> = Item::new("native_denom");
const PROJECTS: Map<&str, ProjectState> = Map::new("projects");
const DONOR_TOTALS: Map<(&str, &str), Uint128> = Map::new("donor_totals");
const STAKING_VALIDATOR: Item<Option<String>> = Item::new("staking_validator");
const HOLDING_FUNDS: Map<&str, Uint128> = Map::new("holding_funds");
const CLAIM_EXPIRATION_SECONDS: u64 = 365 * 24 * 60 * 60;
const UNBONDING_SECONDS: u64 = 7 * 24 * 60 * 60;

#[derive(Error, Debug, PartialEq)]
pub enum ContractError {
    #[error("standard error: {0}")]
    Std(#[from] cosmwasm_std::StdError),
    #[error("project is not active")]
    ProjectNotActive,
    #[error("donation must contain exactly one configured native coin")]
    InvalidFunds,
    #[error("only the contract owner can perform this action")]
    Unauthorized,
    #[error("only the project beneficiary can claim funds")]
    BeneficiaryUnauthorized,
    #[error("donation would exceed the project goal")]
    GoalExceeded,
    #[error("project has not reached its funding goal")]
    GoalNotReached,
    #[error("staking validator is not configured")]
    StakingNotConfigured,
    #[error("project funds have already been claimed")]
    AlreadyClaimed,
    #[error("contract is paused")]
    Paused,
    #[error("project already exists")]
    ProjectAlreadyExists,
    #[error("claim expiration has not been reached")]
    ClaimExpirationNotReached,
    #[error("holding project does not exist")]
    HoldingProjectNotFound,
    #[error("validator unbonding period is not complete")]
    UnbondingNotComplete,
}

#[entry_point]
pub fn instantiate(
    deps: DepsMut,
    _env: Env,
    info: MessageInfo,
    msg: InstantiateMsg,
) -> Result<Response, ContractError> {
    set_contract_version(deps.storage, CONTRACT_NAME, CONTRACT_VERSION)?;
    if msg.native_denom.trim().is_empty() {
        return Err(ContractError::Std(cosmwasm_std::StdError::generic_err("native denom is required")));
    }
    NATIVE_DENOM.save(deps.storage, &msg.native_denom)?;
    OWNER.save(deps.storage, &info.sender.to_string())?;
    PAUSED.save(deps.storage, &false)?;
    STAKING_VALIDATOR.save(deps.storage, &None)?;
    for project in msg.projects {
        PROJECTS.save(
            deps.storage,
            &project.id,
            &ProjectState {
                goal_micro_tx: project.goal_micro_tx,
                raised_micro_tx: Uint128::zero(),
                donor_count: 0,
                status: project.status,
                metadata_token_id: project.metadata_token_id,
                beneficiary: deps.api.addr_validate(&project.beneficiary)?.to_string(),
                staked_micro_tx: Uint128::zero(),
                funded_at: None,
                claim_expires_at: None,
                unstaking_started_at: None,
            },
        )?;
    }
    Ok(Response::new().add_attribute("action", "instantiate"))
}

#[entry_point]
pub fn execute(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    msg: ExecuteMsg,
) -> Result<Response, ContractError> {
    match msg {
        ExecuteMsg::Donate { project_id } => {
            ensure_not_paused(deps.storage)?;
            donate(deps, env, info, project_id)
        }
        ExecuteMsg::ClaimProjectFunds { project_id } => {
            ensure_not_paused(deps.storage)?;
            claim_project_funds(deps, env, info, project_id)
        }
        ExecuteMsg::ExpireProjectFunds { project_id, holding_project_id } => {
            ensure_not_paused(deps.storage)?;
            expire_project_funds(deps, env, project_id, holding_project_id)
        }
        ExecuteMsg::ConfigureStaking { validator } => {
            ensure_owner(deps.storage, deps.api, &info.sender)?;
            if validator.trim().is_empty() {
                return Err(ContractError::StakingNotConfigured);
            }
            STAKING_VALIDATOR.save(deps.storage, &Some(validator.clone()))?;
            Ok(Response::new()
                .add_attribute("action", "staking_configured")
                .add_attribute("validator", validator))
        }
        ExecuteMsg::RegisterProject { project } => {
            ensure_owner(deps.storage, deps.api, &info.sender)?;
            if PROJECTS.has(deps.storage, &project.id) {
                return Err(ContractError::ProjectAlreadyExists);
            }
            let id = project.id.clone();
            PROJECTS.save(deps.storage, &id, &project_state(deps.api, project)?)?;
            Ok(Response::new().add_attribute("action", "project_registered").add_attribute("project_id", id))
        }
        ExecuteMsg::SetProjectStatus { project_id, status } => {
            ensure_owner(deps.storage, deps.api, &info.sender)?;
            let mut project = PROJECTS.load(deps.storage, &project_id)?;
            project.status = status;
            PROJECTS.save(deps.storage, &project_id, &project)?;
            Ok(Response::new()
                .add_attribute("action", "set_project_status")
                .add_attribute("project_id", project_id))
        }
        ExecuteMsg::UpdateProjectMetadata { project_id, metadata_token_id } => {
            ensure_owner(deps.storage, deps.api, &info.sender)?;
            let mut project = PROJECTS.load(deps.storage, &project_id)?;
            project.metadata_token_id = metadata_token_id;
            PROJECTS.save(deps.storage, &project_id, &project)?;
            Ok(Response::new().add_attribute("action", "project_metadata_updated").add_attribute("project_id", project_id))
        }
        ExecuteMsg::SetPaused { paused } => {
            ensure_owner(deps.storage, deps.api, &info.sender)?;
            PAUSED.save(deps.storage, &paused)?;
            Ok(Response::new().add_attribute("action", "set_paused").add_attribute("paused", paused.to_string()))
        }
    }
}

fn ensure_owner(storage: &dyn cosmwasm_std::Storage, api: &dyn cosmwasm_std::Api, sender: &cosmwasm_std::Addr) -> Result<(), ContractError> {
    let owner = OWNER.load(storage)?;
    if *sender != api.addr_validate(&owner)? { return Err(ContractError::Unauthorized); }
    Ok(())
}

fn ensure_not_paused(storage: &dyn cosmwasm_std::Storage) -> Result<(), ContractError> {
    if PAUSED.may_load(storage)?.unwrap_or(false) { return Err(ContractError::Paused); }
    Ok(())
}

fn project_state(api: &dyn cosmwasm_std::Api, project: ProjectInit) -> Result<ProjectState, ContractError> {
    Ok(ProjectState {
        goal_micro_tx: project.goal_micro_tx,
        raised_micro_tx: Uint128::zero(),
        donor_count: 0,
        status: project.status,
        metadata_token_id: project.metadata_token_id,
        beneficiary: api.addr_validate(&project.beneficiary)?.to_string(),
        staked_micro_tx: Uint128::zero(),
        funded_at: None,
        claim_expires_at: None,
        unstaking_started_at: None,
    })
}

fn donate(deps: DepsMut, env: Env, info: MessageInfo, project_id: String) -> Result<Response, ContractError> {
    let mut project = PROJECTS.load(deps.storage, &project_id)?;
    if !matches!(project.status, ProjectStatus::Active) {
        return Err(ContractError::ProjectNotActive);
    }
    let native_denom = NATIVE_DENOM.load(deps.storage)?;
    if info.funds.len() != 1 || info.funds[0].denom != native_denom || info.funds[0].amount.is_zero() {
        return Err(ContractError::InvalidFunds);
    }

    let amount = info.funds[0].amount;
    if project.raised_micro_tx + amount > project.goal_micro_tx {
        return Err(ContractError::GoalExceeded);
    }
    let donor_key = info.sender.as_str();
    let previous = DONOR_TOTALS
        .may_load(deps.storage, (&project_id, donor_key))?
        .unwrap_or_default();
    if previous.is_zero() {
        project.donor_count += 1;
    }
    project.raised_micro_tx += amount;
    if project.raised_micro_tx == project.goal_micro_tx {
        project.status = ProjectStatus::Funded;
        project.funded_at = Some(env.block.time.seconds());
        project.claim_expires_at = Some(env.block.time.seconds().saturating_add(CLAIM_EXPIRATION_SECONDS));
    }
    DONOR_TOTALS.save(deps.storage, (&project_id, donor_key), &(previous + amount))?;
    PROJECTS.save(deps.storage, &project_id, &project)?;

    let mut response = Response::new()
        .add_attribute("action", "donation_received")
        .add_attribute("project_id", &project_id)
        .add_attribute("donor_address", info.sender)
        .add_attribute("amount_microtx", amount);
    if let Some(validator) = STAKING_VALIDATOR.may_load(deps.storage)?.flatten() {
        project.staked_micro_tx += amount;
        PROJECTS.save(deps.storage, &project_id, &project)?;
        response = response.add_message(CosmosMsg::Staking(StakingMsg::Delegate {
            validator,
            amount: Coin::new(amount.u128(), native_denom),
        }));
    }
    Ok(response)
}

fn claim_project_funds(deps: DepsMut, env: Env, info: MessageInfo, project_id: String) -> Result<Response, ContractError> {
    let mut project = PROJECTS.load(deps.storage, &project_id)?;
    if info.sender != deps.api.addr_validate(&project.beneficiary)? {
        return Err(ContractError::BeneficiaryUnauthorized);
    }
    if matches!(project.status, ProjectStatus::Closed | ProjectStatus::Expired | ProjectStatus::Expiring) {
        return Err(ContractError::AlreadyClaimed);
    }
    if project.raised_micro_tx < project.goal_micro_tx {
        return Err(ContractError::GoalNotReached);
    }
    if matches!(project.status, ProjectStatus::Unstaking) {
        if env.block.time.seconds() < project.unstaking_started_at.unwrap_or_default().saturating_add(UNBONDING_SECONDS) {
            return Err(ContractError::UnbondingNotComplete);
        }
        project.status = ProjectStatus::Funded;
        project.staked_micro_tx = Uint128::zero();
        project.unstaking_started_at = None;
        PROJECTS.save(deps.storage, &project_id, &project)?;
        return Ok(Response::new()
            .add_message(BankMsg::Send {
                to_address: project.beneficiary,
                amount: vec![Coin::new(project.raised_micro_tx.u128(), NATIVE_DENOM.load(deps.storage)?)],
            })
            .add_attribute("action", "project_funds_released")
            .add_attribute("project_id", project_id)
            .add_attribute("amount_microtx", project.raised_micro_tx));
    }
    if !project.staked_micro_tx.is_zero() {
        let validator = STAKING_VALIDATOR.load(deps.storage)?.ok_or(ContractError::StakingNotConfigured)?;
        project.status = ProjectStatus::Unstaking;
        project.unstaking_started_at = Some(env.block.time.seconds());
        PROJECTS.save(deps.storage, &project_id, &project)?;
        return Ok(Response::new()
            .add_message(CosmosMsg::Staking(StakingMsg::Undelegate {
                validator,
                amount: Coin::new(project.staked_micro_tx.u128(), NATIVE_DENOM.load(deps.storage)?),
            }))
            .add_attribute("action", "project_funds_unstaking")
            .add_attribute("project_id", project_id)
            .add_attribute("note", "return after validator unbonding period to release funds"));
    }
    project.status = ProjectStatus::Closed;
    project.staked_micro_tx = Uint128::zero();
    project.unstaking_started_at = None;
    PROJECTS.save(deps.storage, &project_id, &project)?;
    Ok(Response::new()
        .add_message(BankMsg::Send {
            to_address: project.beneficiary,
            amount: vec![Coin::new(project.raised_micro_tx.u128(), NATIVE_DENOM.load(deps.storage)?)],
        })
        .add_attribute("action", "project_funds_claimed")
        .add_attribute("project_id", project_id)
        .add_attribute("amount_microtx", project.raised_micro_tx))
}

fn expire_project_funds(
    deps: DepsMut,
    env: Env,
    project_id: String,
    holding_project_id: String,
) -> Result<Response, ContractError> {
    let mut project = PROJECTS.load(deps.storage, &project_id)?;
    if project.claim_expires_at.is_none() || env.block.time.seconds() < project.claim_expires_at.unwrap_or_default() {
        return Err(ContractError::ClaimExpirationNotReached);
    }
    if project.status == ProjectStatus::Expired {
        return Err(ContractError::AlreadyClaimed);
    }
    if !PROJECTS.has(deps.storage, &holding_project_id) {
        return Err(ContractError::HoldingProjectNotFound);
    }
    if project.status == ProjectStatus::Expiring {
        if env.block.time.seconds() < project.unstaking_started_at.unwrap_or_default().saturating_add(UNBONDING_SECONDS) {
            return Err(ContractError::UnbondingNotComplete);
        }
        let mut holding = PROJECTS.load(deps.storage, &holding_project_id)?;
        holding.raised_micro_tx += project.raised_micro_tx;
        let held = HOLDING_FUNDS.may_load(deps.storage, &holding_project_id)?.unwrap_or_default();
        HOLDING_FUNDS.save(deps.storage, &holding_project_id, &(held + project.raised_micro_tx))?;
        project.status = ProjectStatus::Expired;
        project.staked_micro_tx = Uint128::zero();
        project.unstaking_started_at = None;
        PROJECTS.save(deps.storage, &holding_project_id, &holding)?;
        PROJECTS.save(deps.storage, &project_id, &project)?;
        return Ok(Response::new()
            .add_attribute("action", "project_funds_expired")
            .add_attribute("project_id", project_id)
            .add_attribute("holding_project_id", holding_project_id)
            .add_attribute("amount_microtx", project.raised_micro_tx));
    }
    if !project.staked_micro_tx.is_zero() {
        let validator = STAKING_VALIDATOR.load(deps.storage)?.ok_or(ContractError::StakingNotConfigured)?;
        project.status = ProjectStatus::Expiring;
        project.unstaking_started_at = Some(env.block.time.seconds());
        PROJECTS.save(deps.storage, &project_id, &project)?;
        return Ok(Response::new()
            .add_message(CosmosMsg::Staking(StakingMsg::Undelegate {
                validator,
                amount: Coin::new(project.staked_micro_tx.u128(), NATIVE_DENOM.load(deps.storage)?),
            }))
            .add_attribute("action", "project_funds_expiring")
            .add_attribute("project_id", project_id)
            .add_attribute("holding_project_id", holding_project_id)
            .add_attribute("note", "return after validator unbonding period to complete recovery"));
    }
    let mut holding = PROJECTS.load(deps.storage, &holding_project_id)?;
    holding.raised_micro_tx += project.raised_micro_tx;
    let held = HOLDING_FUNDS.may_load(deps.storage, &holding_project_id)?.unwrap_or_default();
    HOLDING_FUNDS.save(deps.storage, &holding_project_id, &(held + project.raised_micro_tx))?;
    project.status = ProjectStatus::Expired;
    project.unstaking_started_at = None;
    PROJECTS.save(deps.storage, &holding_project_id, &holding)?;
    PROJECTS.save(deps.storage, &project_id, &project)?;
    Ok(Response::new()
        .add_attribute("action", "project_funds_expired")
        .add_attribute("project_id", project_id)
        .add_attribute("holding_project_id", holding_project_id)
        .add_attribute("amount_microtx", project.raised_micro_tx))
}

#[entry_point]
pub fn query(deps: Deps, _env: Env, msg: QueryMsg) -> StdResult<cosmwasm_std::Binary> {
    match msg {
        QueryMsg::Project { project_id } => to_json_binary(&project_query(deps, project_id)?),
        QueryMsg::DonorTotal { project_id, wallet_address } => {
            let amount = DONOR_TOTALS
                .may_load(deps.storage, (&project_id, wallet_address.as_str()))?
                .unwrap_or_default();
            to_json_binary(&DonorTotalResponse { project_id, wallet_address, amount_micro_tx: amount })
        }
        QueryMsg::ContractStatus {} => to_json_binary(&ContractStatusResponse {
            paused: PAUSED.may_load(deps.storage)?.unwrap_or(false),
            version: cw2::get_contract_version(deps.storage)?.version,
        }),
    }
}

#[entry_point]
pub fn migrate(deps: DepsMut, _env: Env, msg: MigrateMsg) -> Result<Response, ContractError> {
    set_contract_version(deps.storage, CONTRACT_NAME, CONTRACT_VERSION)?;
    if msg.native_denom.trim().is_empty() {
        return Err(ContractError::Std(cosmwasm_std::StdError::generic_err("native denom is required")));
    }
    NATIVE_DENOM.save(deps.storage, &msg.native_denom)?;
    let paused = PAUSED.may_load(deps.storage)?.unwrap_or(false);
    PAUSED.save(deps.storage, &paused)?;
    Ok(Response::new().add_attribute("action", "migrate").add_attribute("version", CONTRACT_VERSION).add_attribute("native_denom", msg.native_denom))
}

fn project_query(deps: Deps, project_id: String) -> StdResult<ProjectResponse> {
    let project = PROJECTS.load(deps.storage, &project_id)?;
    Ok(ProjectResponse {
        id: project_id,
        goal_micro_tx: project.goal_micro_tx,
        raised_micro_tx: project.raised_micro_tx,
        donor_count: project.donor_count,
        status: project.status,
        metadata_token_id: project.metadata_token_id,
        beneficiary: project.beneficiary,
        staked_micro_tx: project.staked_micro_tx,
        funded_at: project.funded_at,
        claim_expires_at: project.claim_expires_at,
        unstaking_started_at: project.unstaking_started_at,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use cosmwasm_std::testing::{mock_dependencies, mock_env, mock_info};

    fn instantiate_msg() -> InstantiateMsg {
        InstantiateMsg {
            native_denom: "utestcore".to_string(),
            projects: vec![ProjectInit {
                id: "harbor".to_string(),
                goal_micro_tx: Uint128::new(1_000_000),
                status: ProjectStatus::Active,
                metadata_token_id: "token-1".to_string(),
                beneficiary: "core1beneficiary".to_string(),
            }],
        }
    }

    #[test]
    fn accepts_one_native_donation_and_tracks_totals() {
        let mut deps = mock_dependencies();
        instantiate(deps.as_mut(), mock_env(), mock_info("owner", &[]), instantiate_msg()).unwrap();

        let response = execute(
            deps.as_mut(),
            mock_env(),
            mock_info("donor", &[Coin::new(250_000, "utestcore")]),
            ExecuteMsg::Donate { project_id: "harbor".to_string() },
        )
        .unwrap();

        assert_eq!(response.attributes[0].value, "donation_received");
        let project = project_query(deps.as_ref(), "harbor".to_string()).unwrap();
        assert_eq!(project.raised_micro_tx, Uint128::new(250_000));
        assert_eq!(project.donor_count, 1);
    }

    #[test]
    fn rejects_non_native_or_multiple_coins() {
        let mut deps = mock_dependencies();
        instantiate(deps.as_mut(), mock_env(), mock_info("owner", &[]), instantiate_msg()).unwrap();

        let result = execute(
            deps.as_mut(),
            mock_env(),
            mock_info("donor", &[Coin::new(1, "uatom"), Coin::new(1, "utestcore")]),
            ExecuteMsg::Donate { project_id: "harbor".to_string() },
        );

        assert_eq!(result.unwrap_err(), ContractError::InvalidFunds);
    }

    #[test]
    fn only_owner_can_change_project_status() {
        let mut deps = mock_dependencies();
        instantiate(deps.as_mut(), mock_env(), mock_info("owner", &[]), instantiate_msg()).unwrap();

        let result = execute(
            deps.as_mut(),
            mock_env(),
            mock_info("not-owner", &[]),
            ExecuteMsg::SetProjectStatus { project_id: "harbor".to_string(), status: ProjectStatus::Closed },
        );

        assert_eq!(result.unwrap_err(), ContractError::Unauthorized);
    }

    #[test]
    fn keeps_donations_in_contract_until_goal_then_allows_beneficiary_claim() {
        let mut deps = mock_dependencies();
        instantiate(deps.as_mut(), mock_env(), mock_info("owner", &[]), instantiate_msg()).unwrap();
        execute(
            deps.as_mut(),
            mock_env(),
            mock_info("donor", &[Coin::new(1_000_000, "utestcore")]),
            ExecuteMsg::Donate { project_id: "harbor".to_string() },
        )
        .unwrap();

        let response = execute(
            deps.as_mut(),
            mock_env(),
            mock_info("core1beneficiary", &[]),
            ExecuteMsg::ClaimProjectFunds { project_id: "harbor".to_string() },
        )
        .unwrap();

        assert_eq!(response.attributes[0].value, "project_funds_claimed");
        assert_eq!(response.messages.len(), 1);
    }
}
