import { supabase } from "./supabase";

export type ReviewQueueItem = {
  id: string;
  title: string;
  church_name: string;
  location: string;
  description: string;
  category: string;
  goal_tx: number;
  required_attestations: number;
  required_weighted_score: number;
  attestation_status: string;
  project_attestations: { decision: string; reviewer_wallet: string; reputation: number }[];
};

export async function applyAsReviewer(walletAddress: string, expertise: string[]) {
  if (!supabase) throw new Error("Supabase is not configured");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in before applying as a reviewer");
  const { data: existing, error: lookupError } = await supabase
    .from("reviewers")
    .select("status")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (lookupError) throw new Error(`Unable to check reviewer application: ${lookupError.message}`);
  if (existing) {
    if (existing.status === "active") throw new Error("You are already an active reviewer.");
    if (existing.status === "pending") throw new Error("Your reviewer application is already under review.");
    throw new Error("Your reviewer application is suspended.");
  }
  const { error } = await supabase.from("reviewers").insert({ profile_id: user.id, wallet_address: walletAddress, expertise, status: "pending" });
  if (error) throw new Error(`Unable to submit reviewer application: ${error.message}`);
}

export async function getReviewerQueue() {
  if (!supabase) return [] as ReviewQueueItem[];
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in before opening the reviewer queue");
  const { data: reviewer, error: reviewerError } = await supabase.from("reviewers").select("status").eq("profile_id", user.id).maybeSingle();
  if (reviewerError) throw reviewerError;
  if (reviewer?.status !== "active") return [];
  const { data, error } = await supabase.from("projects").select("id, title, church_name, location, description, category, goal_tx, required_attestations, required_weighted_score, attestation_status, project_attestations(decision, reviewer_wallet, reputation)").in("attestation_status", ["pending", "paused"]).order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ReviewQueueItem[];
}

export async function submitProjectReview(projectId: string, decision: "approve" | "reject", note: string) {
  if (!supabase) throw new Error("Supabase is not configured");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in before submitting a review");
  const { error } = await supabase.rpc("submit_project_attestation", { target_project_id: projectId, next_decision: decision === "approve" ? "attest" : "flag" });
  if (error) throw new Error(`Unable to submit review: ${error.message}`);
}
