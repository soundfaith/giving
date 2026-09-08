import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getProjectOnChain } from "./wallet";

export type ProjectCategory = "Sound & AV" | "Worship & Gathering" | "Facilities & Maintenance" | "Community & Outreach" | "General Church Needs";

export type Project = {
  id: string;
  church: string;
  location: string;
  title: string;
  description: string;
  category: ProjectCategory;
  raised: number;
  goal: number;
  donors: number;
  accent: string;
  featured?: boolean;
  image_urls?: string[];
};

export type Identity = {
  id: string;
  displayName: string;
  provider: "google" | "apple" | "email";
  email?: string;
  walletAddress?: string;
};

export type Profile = {
  email: string | null;
  wallet_address: string | null;
  handle: string | null;
  created_at: string | null;
};

export type DonationRecord = {
  id: string;
  project_id: string;
  amount_tx: number;
  tx_usd_rate?: number | null;
  amount_usd?: number | null;
  tx_hash: string;
  network: string;
  created_at: string;
  project?: { title: string; church_name: string } | null;
  wallet_address?: string | null;
};

export type TxExchangeRate = { tx_usd_rate: number; updated_at: string };

export type ProjectComment = {
  id: string;
  project_id: string;
  author_handle: string;
  message: string;
  profile_id?: string | null;
  created_at: string;
};

export type Notification = {
  id: string;
  kind: string;
  project_id: string | null;
  title: string;
  message: string;
  read_at: string | null;
  created_at: string;
};

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const supabaseGlobal = globalThis as typeof globalThis & {
  __soundfaithSupabase?: SupabaseClient;
};

const adjectives = ["kind","friendly","gentle","brave","wild","happy","calm","bright","golden","patient","silent","hollow","joyful","steady","gracious","dreaming","peaceful","kindred","luminous","pilgrim","hopeful","blooming","forest","harbor","prayerful","strong","humble","grateful","radiant","quiet","gentle","warm","saintly","bold","merry","courageous","evergreen","sunlit","beloved","waking","joyous","anchor","meadow","dawn","little","gentle","lively","kindly"];
const nouns = ["shepherd","saint","guardian","anchor","harbor","meadow","lark","grove","bloom","oak","chapel","cabin","path","river","beacon","hope","field","pioneer","companion","keeper","traveler","dove","sunrise","garden","lantern","courage","fellowship","light","song","winter","summit","valley","friend","bread","trail","hymn","blessing","guide","vision","hearth","ember"];

function randomFrom<T>(items: T[]) {
  return items[Math.floor(Math.random() * items.length)];
}

async function generateUniqueHandle(client: SupabaseClient): Promise<string> {
  const attempts = 50;
  for (let index = 0; index < attempts; index += 1) {
    const handle = `${randomFrom(adjectives)}-${randomFrom(nouns)}-${Math.floor(1000 + Math.random() * 9000)}`;
    const { data, error } = await client.from("profiles").select("id").eq("handle", handle).maybeSingle();
    if (!error && !data) return handle;
  }
  return `user-${Date.now().toString(36)}`;
}

export const supabase: SupabaseClient | null =
  supabaseUrl && supabaseAnonKey
    ? (supabaseGlobal.__soundfaithSupabase ??= createClient(supabaseUrl, supabaseAnonKey))
    : null;

export const projectRepository = {
  async list(): Promise<Project[]> {
    if (!supabase) return [];

    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .in("status", ["active", "funded"])
      .order("created_at", { ascending: false });
    if (error) throw error;
    const { data: rate } = await supabase.from("tx_exchange_rates").select("tx_usd_rate").eq("id", true).maybeSingle();
    const txUsdRate = Number(rate?.tx_usd_rate ?? 1);
    const projectIds = (data ?? []).map((project) => project.id);
    const { data: totals, error: totalsError } =
      projectIds.length > 0
        ? await supabase
            .from("project_totals")
            .select("id, raised_tx, donor_count")
            .in("id", projectIds)
        : { data: [], error: null };
    if (totalsError) throw totalsError;
    const totalsByProject = new Map(
      (totals ?? []).map((total) => [total.id, total]),
    );

    const chainProjectMap = new Map<string, { raised: number; donors: number }>();
    for (const project of data ?? []) {
      try {
        const onChainProject = await getProjectOnChain(project.id);
        chainProjectMap.set(project.id, {
          raised: Number(onChainProject.raised_micro_tx ?? "0") / 1_000_000,
          donors: Number(onChainProject.donor_count ?? 0),
        });
      } catch {
        // Fall back to the Supabase totals when the contract is not configured or the project is not yet registered.
      }
    }

    return (data ?? []).map((project) => {
      const chainStats = chainProjectMap.get(project.id);
      return {
        id: project.id,
        church: project.church_name,
        location: project.location,
        title: project.title,
        description: project.description,
        category: project.category as ProjectCategory,
        raised: (chainStats?.raised ?? Number(totalsByProject.get(project.id)?.raised_tx ?? 0)) * txUsdRate,
        goal: Number(project.goal_tx),
        donors: chainStats?.donors ?? Number(totalsByProject.get(project.id)?.donor_count ?? 0),
        accent: "photo-harbor",
        image_urls: project.image_urls ?? [],
      };
    });
  },

  async getById(projectId: string): Promise<Project | null> {
    if (!supabase) return null;
    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .eq("id", projectId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const { data: rate } = await supabase.from("tx_exchange_rates").select("tx_usd_rate").eq("id", true).maybeSingle();
    const txUsdRate = Number(rate?.tx_usd_rate ?? 1);

    const project = {
      id: data.id,
      church: data.church_name,
      location: data.location,
      title: data.title,
      description: data.description,
      category: data.category as ProjectCategory,
      goal: Number(data.goal_tx),
      raised: 0,
      donors: 0,
      accent: "photo-harbor",
      image_urls: data.image_urls ?? [],
    };

    try {
      const onChainProject = await getProjectOnChain(projectId);
      project.raised = (Number(onChainProject.raised_micro_tx ?? "0") / 1_000_000) * txUsdRate;
      project.donors = Number(onChainProject.donor_count ?? 0);
    } catch {
      const { data: totals, error: totalsError } = await supabase
        .from("project_totals")
        .select("raised_tx, donor_count")
        .eq("id", projectId)
        .maybeSingle();
      if (!totalsError && totals) {
        project.raised = Number(totals.raised_tx ?? 0) * txUsdRate;
        project.donors = Number(totals.donor_count ?? 0);
      }
    }

    return project;
  },

  async getDonationHistory(projectId: string): Promise<DonationRecord[]> {
    if (!supabase) return [];
    const { data, error } = await supabase
      .from("donations")
      .select("id, project_id, amount_tx, tx_usd_rate, amount_usd, tx_hash, network, created_at, wallet_address")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as DonationRecord[];
  },

  async getComments(projectId: string): Promise<ProjectComment[]> {
    if (!supabase) return [];
    const { data, error } = await supabase
      .from("project_comments")
      .select("id, project_id, author_handle, message, profile_id, created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as ProjectComment[];
  },

  async postComment(projectId: string, message: string, authorHandle?: string | null) {
    if (!supabase) throw new Error("Supabase is not configured");
    const trimmedMessage = message.trim();
    if (!trimmedMessage) throw new Error("Message is required");
    const { data: user } = await supabase.auth.getUser();
    let finalHandle = authorHandle?.trim() || null;
    if (user?.user) {
      const profile = await identityRepository.getProfile();
      finalHandle = profile?.handle ?? finalHandle ?? "community-supporter";
    }
    if (!finalHandle) throw new Error("A handle is required to post a comment");
    const { data, error } = await supabase
      .from("project_comments")
      .insert({
        project_id: projectId,
        author_handle: finalHandle,
        message: trimmedMessage,
        profile_id: user.user?.id ?? null,
      })
      .select("id, project_id, author_handle, message, profile_id, created_at")
      .single();
    if (error) throw error;
    return data as ProjectComment;
  },
};

export const identityRepository = {
  async connect(
    provider: Identity["provider"],
    email?: string,
  ): Promise<Identity> {
    if (!supabase && (provider === "google" || provider === "apple")) {
      throw new Error("Social sign-in is not configured for this deployment. Add the VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY environment variables in Vercel, then redeploy.");
    }

    if (!supabase)
      return {
        id: "local-visitor",
        displayName: "Local supporter",
        provider,
        email,
      };

    if (provider === "google" || provider === "apple") {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}${window.location.pathname}`,
          skipBrowserRedirect: true,
        },
      });
      if (error) throw error;
      if (!data.url) throw new Error(`Unable to start ${provider} sign-in. Check the OAuth provider configuration.`);
      window.location.assign(data.url);
      return {
        id: "redirecting",
        displayName: `Connecting with ${provider}`,
        provider,
      };
    }

    if (!email) throw new Error("Enter an email address to continue");
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) throw error;
    return {
      id: "magic-link-sent",
      displayName: "Check your email",
      provider,
      email,
    };
  },

  async syncProfile(walletAddress?: string) {
    if (!supabase) return null;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const nextWalletAddress = walletAddress ?? (await supabase.from("profile_wallets").select("wallet_address").eq("user_id", user.id).maybeSingle()).data?.wallet_address ?? null;
    if (nextWalletAddress) {
      await supabase.from("profile_wallets").upsert({ user_id: user.id, wallet_address: nextWalletAddress }, { onConflict: "user_id" });
    }

    const { data: existingProfile, error: existingError } = await supabase
      .from("profiles")
      .select("handle")
      .eq("id", user.id)
      .maybeSingle();
    if (existingError) throw existingError;

    const handle = existingProfile?.handle ?? (await generateUniqueHandle(supabase));
    const profile = {
      id: user.id,
      email: user.email,
      handle,
      updated_at: new Date().toISOString(),
      ...(nextWalletAddress ? { wallet_address: nextWalletAddress } : {}),
    };
    const { data, error } = await supabase
      .from("profiles")
      .upsert(profile, { onConflict: "id" })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async updateProfileHandle(handle: string) {
    if (!supabase) return null;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Sign in to update your profile");
    const cleaned = handle.trim();
    if (!cleaned) throw new Error("Enter a valid handle");
    const candidate = cleaned.replace(/[^a-z0-9-]+/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").toLowerCase();
    if (!candidate || candidate.length < 3) throw new Error("Handle must be at least 3 characters");
    const unique = await generateUniqueHandle(supabase);
    const final = candidate;
    const { data, error } = await supabase
      .from("profiles")
      .select("id")
      .eq("handle", final)
      .maybeSingle();
    if (!error && data && data.id !== user.id) throw new Error("That handle is already taken");
    const { data: updated, error: updateError } = await supabase
      .from("profiles")
      .update({ handle: final, updated_at: new Date().toISOString() })
      .eq("id", user.id)
      .select("email, wallet_address, handle, created_at")
      .single();
    if (updateError) throw updateError;
    return updated;
  },

  async deleteProfile() {
    if (!supabase) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("profiles").delete().eq("id", user.id);
  },

  async getProfile() {
    if (!supabase) return null;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    const { data, error } = await supabase
      .from("profiles")
      .select("email, wallet_address, handle")
      .eq("id", user.id)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  async getDashboard() {
    if (!supabase) return { profile: null, ownedProjects: [], donations: [] };
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Sign in to view your profile");
    const [{ data: profile, error: profileError }, { data: ownedProjects, error: projectsError }, { data: donorDonations, error: donorDonationsError }] = await Promise.all([
      supabase.from("profiles").select("email, wallet_address, handle, created_at").eq("id", user.id).maybeSingle(),
      supabase.from("projects").select("id, church_name, location, title, description, category, goal_tx, status, created_at").eq("submitted_by", user.id).order("created_at", { ascending: false }),
      supabase.from("donations").select("id, project_id, amount_tx, tx_hash, network, created_at, projects(title, church_name)").eq("profile_id", user.id).order("created_at", { ascending: false }),
    ]);
    if (profileError) throw profileError;
    if (projectsError) throw projectsError;
    if (donorDonationsError) throw donorDonationsError;
    const ownedProjectIds = (ownedProjects ?? []).map((project) => project.id);
    const { data: ownerDonations, error: ownerDonationsError } = ownedProjectIds.length
      ? await supabase.from("donations").select("id, project_id, amount_tx, tx_usd_rate, amount_usd, tx_hash, network, created_at, wallet_address, projects(title, church_name)").in("project_id", ownedProjectIds).order("created_at", { ascending: false })
      : { data: [], error: null };
    if (ownerDonationsError) throw ownerDonationsError;
    const donationsById = new Map<string, DonationRecord>();
    for (const donation of [...(donorDonations ?? []), ...(ownerDonations ?? [])]) donationsById.set(donation.id, donation as DonationRecord);
    return { profile, ownedProjects: ownedProjects ?? [], donations: [...donationsById.values()].sort((left, right) => right.created_at.localeCompare(left.created_at)) };
  },

  async getNotifications(offset = 0, limit = 20): Promise<Notification[]> {
    if (!supabase) return [];
    const { data, error } = await supabase.from("notifications").select("id, kind, project_id, title, message, read_at, created_at").order("created_at", { ascending: false }).range(offset, offset + limit - 1);
    if (error) throw error;
    return (data ?? []) as Notification[];
  },

  async getTxExchangeRate(): Promise<TxExchangeRate> {
    if (!supabase) return { tx_usd_rate: 1, updated_at: new Date(0).toISOString() };
    const { data, error } = await supabase.from("tx_exchange_rates").select("tx_usd_rate, updated_at").eq("id", true).single();
    if (error) throw error;
    return { tx_usd_rate: Number(data.tx_usd_rate), updated_at: data.updated_at };
  },

  async markNotificationRead(id: string) {
    if (!supabase) return;
    const { error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
    if (error) throw error;
  },

  async signOut() {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },
};
