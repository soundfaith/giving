import { supabase } from "./supabase";

export type ChurchProjectDraft = {
  organizationId: string;
  title: string;
  churchName: string;
  location: string;
  description: string;
  category: "Sound & AV" | "Worship & Gathering" | "Facilities & Maintenance" | "Community & Outreach" | "General Church Needs";
  goalTx: number;
  ownerWalletAddress: string;
  metadataTokenId?: string;
};

export async function createChurchOrganization(name: string) {
  if (!supabase) throw new Error("Supabase is not configured");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in before creating a church project");
  const { data, error } = await supabase
    .from("church_organizations")
    .insert({ owner_id: user.id, name })
    .select()
    .single();
  if (error) throw new Error(`Unable to create church organization: ${error.message}`);
  if (!data) throw new Error("The church organization was not returned after creation.");
  return data;
}

export async function submitChurchProject(draft: ChurchProjectDraft) {
  if (!supabase) throw new Error("Supabase is not configured");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in before submitting a church project");
  const { data, error } = await supabase
    .from("projects")
    .insert({
      organization_id: draft.organizationId,
      submitted_by: user.id,
      owner_wallet_address: draft.ownerWalletAddress,
      church_name: draft.churchName,
      location: draft.location,
      title: draft.title,
      description: draft.description,
      category: draft.category,
      goal_tx: draft.goalTx,
      metadata_token_id: draft.metadataTokenId ?? "",
      status: "review",
    })
    .select()
    .single();
  if (error) throw new Error(`Unable to create project: ${error.message}`);
  if (!data) throw new Error("The project was not returned after creation.");
  return data;
}

export async function uploadProjectPhoto(projectId: string, file: File) {
  if (!supabase) throw new Error("Supabase is not configured");
  const extension = file.name.split(".").pop() ?? "jpg";
  const path = `${projectId}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage
    .from("project-photos")
    .upload(path, file, { upsert: false, contentType: file.type });
  if (error) throw new Error(`Project created, but photo upload failed: ${error.message}`);
  return path;
}

export async function attachProjectPhotos(projectId: string, imageUrls: string[]) {
  if (!supabase) throw new Error("Supabase is not configured");
  const { error } = await supabase.from("projects").update({ image_urls: imageUrls }).eq("id", projectId);
  if (error) throw new Error(`Project created, but photo references could not be saved: ${error.message}`);
}

export function getProjectPhotoUrl(path: string) {
  if (!supabase) return path;
  return supabase.storage.from("project-photos").getPublicUrl(path).data.publicUrl;
}
