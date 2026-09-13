import { supabase } from "./supabase";

export type AdminReviewer = { profile_id: string; email: string | null; wallet_address: string; status: "pending" | "active" | "suspended"; expertise: string[]; created_at: string };
export type AdminProject = { id: string; title: string; church_name: string; location: string; status: string; goal_tx: number; submitted_by: string | null; owner_wallet_address: string | null; required_reviews: number; approval_threshold: number; rejection_threshold: number; approvals: number; rejections: number };
export type RelayerStatus = { last_seen_at: string; last_success_at: string | null; last_error: string | null; last_project_id: string | null; last_transaction_hash: string | null } | null;

function client() { if (!supabase) throw new Error("Supabase is not configured"); return supabase; }
export async function getAdminStatus() { const { data, error } = await client().rpc("is_soundfaith_admin"); if (error) throw error; return Boolean(data); }
export async function getViewerRole(): Promise<"admin" | "reviewer" | null> {
	if (!supabase) return null;
	try {
		if (await getAdminStatus()) return "admin";
	} catch {
		return null;
	}
	const { data, error } = await supabase.from("reviewers").select("status").maybeSingle();
	if (error || data?.status !== "active") return null;
	return "reviewer";
}
export async function getAdminData() { const api = client(); const [{ data: reviewers, error: reviewerError }, { data: projects, error: projectError }] = await Promise.all([api.rpc("admin_list_reviewers"), api.rpc("admin_list_projects")]); if (reviewerError) throw reviewerError; if (projectError) throw projectError; return { reviewers: (reviewers ?? []) as AdminReviewer[], projects: (projects ?? []) as AdminProject[] }; }
export async function getRelayerStatus(): Promise<RelayerStatus> { const { data, error } = await client().rpc("admin_get_relayer_status"); if (error) throw error; return (data?.[0] ?? null) as RelayerStatus; }
export async function getTxExchangeRate() { const { data, error } = await client().rpc("admin_get_tx_exchange_rate"); if (error) throw error; return (data?.[0] ?? null) as { tx_usd_rate: number; updated_at: string } | null; }
export async function setTxExchangeRate(rate: number) { const { data, error } = await client().rpc("admin_set_tx_exchange_rate", { next_tx_usd_rate: rate }); if (error) throw error; return (data?.[0] ?? null) as { tx_usd_rate: number; updated_at: string } | null; }
export async function refreshTxExchangeRate() { const { data, error } = await client().functions.invoke("update-tx-rate", { body: {} }); if (error) throw error; return data as { tx_usd_rate: number; updated_at: string }; }
export type DonationSyncStatus = { total: number; synced: number; unsynced: number };
export async function getDonationSyncStatus() { const { data, error } = await client().functions.invoke("sync-donations", { body: { sync: false } }); if (error) throw error; return data as DonationSyncStatus; }
export async function syncDonations() { const { data, error } = await client().functions.invoke("sync-donations", { body: { sync: true } }); if (error) throw error; return data as DonationSyncStatus; }
export async function setReviewerStatus(profileId: string, status: AdminReviewer["status"]) { const { error } = await client().rpc("admin_set_reviewer_status", { target_profile_id: profileId, next_status: status }); if (error) throw error; }
export async function setReviewThresholds(projectId: string, approvals: number, rejections: number) { const { error } = await client().rpc("admin_set_review_thresholds", { target_project_id: projectId, next_approval_threshold: approvals, next_rejection_threshold: rejections }); if (error) throw error; }
export async function resolveProject(projectId: string, status: "approve" | "closed") {
	if (status === "approve") {
		const { error } = await client().rpc("admin_override_attestation", { target_project_id: projectId, next_status: "active" });
		if (error) throw error;
		return;
	}
	const { error } = await client().rpc("admin_resolve_project", { target_project_id: projectId, next_status: status });
	if (error) throw error;
}
export async function overrideAttestation(projectId: string, status: "active" | "rejected") { const { error } = await client().rpc("admin_override_attestation", { target_project_id: projectId, next_status: status }); if (error) throw error; }
