import { CosmWasmClient } from "npm:@cosmjs/cosmwasm-stargate@0.38.1";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const env = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured`);
  return value;
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

type ChainEvent = { type: string; attributes: Array<{ key: string; value: string }> };
type IndexedTransaction = { hash: string; height: number; events: ChainEvent[] };

function eventValue(event: ChainEvent, key: string) {
  return event.attributes.find((attribute) => attribute.key === key)?.value;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "POST required" }, 405);

  try {
    const supabaseUrl = env("SUPABASE_URL");
    const serviceRoleKey = env("SUPABASE_SERVICE_ROLE_KEY");
    const authorization = request.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const authClient = createClient(supabaseUrl, serviceRoleKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user } } = await authClient.auth.getUser();
    if (!user || user.email?.toLowerCase() !== "soundfaith.core@gmail.com") return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const contractAddress = env("COREUM_DONATION_CONTRACT");
    const rpcUrl = Deno.env.get("COREUM_RPC_URL") ?? "https://rpc.testnet-1.tx.org:443";
    const network = Deno.env.get("COREUM_NETWORK") === "mainnet" ? "coreum-mainnet" : "coreum-testnet";
    const shouldSync = (await request.json().catch(() => ({})) as { sync?: boolean }).sync === true;
    const chain = await CosmWasmClient.connect(rpcUrl);
    const transactions = await chain.searchTx([{ key: "wasm._contract_address", value: contractAddress }]) as unknown as IndexedTransaction[];
    const donationTransactions = transactions
      .map((transaction) => ({ transaction, event: transaction.events.find((event) => event.type === "wasm" && eventValue(event, "action") === "donation_received") }))
      .filter((item): item is { transaction: IndexedTransaction; event: ChainEvent } => Boolean(item.event));

    const { data: projects, error: projectsError } = await supabase.from("projects").select("id, status");
    if (projectsError) throw projectsError;
    const projectIds = new Set((projects ?? []).map((project) => project.id));
    const currentDonationTransactions = donationTransactions.filter(({ event }) => {
      const projectId = eventValue(event, "project_id");
      return Boolean(projectId && projectIds.has(projectId));
    });

    const hashes = currentDonationTransactions.map(({ transaction }) => transaction.hash);
    const { data: existing, error: existingError } = hashes.length
      ? await supabase.from("donations").select("tx_hash").in("tx_hash", hashes)
      : { data: [], error: null };
    if (existingError) throw existingError;
    const existingHashes = new Set((existing ?? []).map((row) => row.tx_hash));
    const unsynced = currentDonationTransactions.filter(({ transaction }) => !existingHashes.has(transaction.hash));

    if (!shouldSync) return json({ total: currentDonationTransactions.length, synced: currentDonationTransactions.length - unsynced.length, unsynced: unsynced.length });

    const { data: rate, error: rateError } = await supabase.from("tx_exchange_rates").select("tx_usd_rate").eq("id", true).single();
    if (rateError) throw rateError;
    const txUsdRate = Number(rate.tx_usd_rate);
    let synced = 0;

    for (const { transaction, event } of unsynced.sort((left, right) => left.transaction.height - right.transaction.height)) {
      const projectId = eventValue(event, "project_id");
      const donorAddress = eventValue(event, "donor_address");
      const amountMicroTx = eventValue(event, "amount_microtx") ?? eventValue(event, "amount");
      if (!projectId || !donorAddress || !amountMicroTx) continue;

      const { data: project, error: projectError } = await supabase.from("projects").select("id").eq("id", projectId).maybeSingle();
      if (projectError) throw projectError;
      if (!project) continue;

      const { data: profile } = await supabase.from("profiles").select("id").eq("wallet_address", donorAddress).maybeSingle();
      const { data: walletProfile } = profile
        ? { data: null }
        : await supabase.from("profile_wallets").select("user_id").eq("wallet_address", donorAddress).maybeSingle();
      const amountTx = Number(amountMicroTx) / 1_000_000;
      const { error: donationError } = await supabase.from("donations").upsert({
        project_id: projectId,
        profile_id: profile?.id ?? walletProfile?.user_id ?? null,
        wallet_address: donorAddress,
        amount_tx: amountTx,
        tx_usd_rate: txUsdRate,
        amount_usd: amountTx * txUsdRate,
        tx_hash: transaction.hash,
        network,
      }, { onConflict: "tx_hash" });
      if (donationError) throw donationError;

      synced += 1;
    }

    // The contract remains active after reaching its goal until the beneficiary
    // starts the claim flow, so funding status must be derived from its totals.
    const { data: currentProjects, error: currentProjectsError } = await supabase.from("projects").select("id, status").in("status", ["active", "funded"]);
    if (currentProjectsError) throw currentProjectsError;
    for (const project of currentProjects ?? []) {
      const onChainProject = await chain.queryContractSmart(contractAddress, { project: { project_id: project.id } }) as { goal_micro_tx?: string; raised_micro_tx?: string };
      const reachedGoal = BigInt(onChainProject.raised_micro_tx ?? "0") >= BigInt(onChainProject.goal_micro_tx ?? "0");
      if (reachedGoal && project.status === "active") {
        const { error: statusError } = await supabase.from("projects").update({ status: "funded" }).eq("id", project.id).eq("status", "active");
        if (statusError) throw statusError;
      }
    }

    return json({ total: currentDonationTransactions.length, synced: currentDonationTransactions.length - unsynced.length + synced, unsynced: unsynced.length - synced });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
