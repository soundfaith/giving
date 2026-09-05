import { supabase } from "./supabase";

export type ReviewQueueItem = {
  id: string;
  title: string;
  church_name: string;
  location: string;
  description: string;
  category: string;
  goal_tx: number;
  review_rounds: { required_reviews: number; status: string }[];
  project_reviews: { decision: string; reviewer_id: string; note: string | null }[];
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
  const { data, error } = await supabase.from("projects").select("id, title, church_name, location, description, category, goal_tx, review_rounds(required_reviews, status), project_reviews(decision, reviewer_id, note)").eq("status", "review").order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ReviewQueueItem[];
}

export async function submitProjectReview(projectId: string, decision: "approve" | "reject", note: string) {
  if (!supabase) throw new Error("Supabase is not configured");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in before submitting a review");
  const { error } = await supabase.from("project_reviews").insert({ project_id: projectId, reviewer_id: user.id, decision, note: note.trim() || null });
  if (error) throw new Error(`Unable to submit review: ${error.message}`);
}
