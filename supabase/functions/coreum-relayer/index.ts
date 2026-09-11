import { DirectSecp256k1HdWallet } from "npm:@cosmjs/proto-signing@0.39.0";
import { stringToPath } from "npm:@cosmjs/crypto@0.39.0";
import { SigningCosmWasmClient } from "npm:@cosmjs/cosmwasm-stargate@0.38.1";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-relayer-secret",
};

const env = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured`);
  return value;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "POST required" }, 405);

  try {
    const relayerSecret = Deno.env.get("RELAYER_CRON_SECRET");
    const suppliedSecret = request.headers.get("x-relayer-secret");
    let authorized = Boolean(relayerSecret && suppliedSecret === relayerSecret);
    if (!authorized) {
      const authorization = request.headers.get("Authorization");
      if (authorization?.startsWith("Bearer ")) {
        const supabaseUrl = env("SUPABASE_URL");
        const serviceRoleKey = env("SUPABASE_SERVICE_ROLE_KEY");
        const userClient = createClient(supabaseUrl, serviceRoleKey, {
          global: { headers: { Authorization: authorization } },
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: { user } } = await userClient.auth.getUser();
        if (user) {
          authorized = user.email?.toLowerCase() === "soundfaith.core@gmail.com";
        }
      }
    }
    if (!authorized) return json({ error: "Unauthorized" }, 401);

    const mnemonic = env("COREUM_MNEMONIC");
    const rpcUrl = Deno.env.get("COREUM_RPC_URL") ?? "https://rpc.testnet-1.tx.org:443";
    const chainId = Deno.env.get("COREUM_CHAIN_ID") ?? "coreum-testnet-1";
    const prefix = Deno.env.get("COREUM_BECH32_PREFIX") ?? "testcore";
    const derivationPath = Deno.env.get("COREUM_DERIVATION_PATH") ?? "m/44'/990'/0'/0/0";
    const contractAddress = env("COREUM_DONATION_CONTRACT");
    const nativeDenom = Deno.env.get("COREUM_NATIVE_DENOM") ?? "utestcore";
    const supabaseUrl = env("SUPABASE_URL");
    const serviceRoleKey = env("SUPABASE_SERVICE_ROLE_KEY");

    const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, {
      prefix,
      hdPaths: [stringToPath(derivationPath)],
    });
    const [account] = await wallet.getAccounts();
    const chain = await SigningCosmWasmClient.connectWithSigner(rpcUrl, wallet);
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const heartbeat = async (input: { success?: boolean; error?: string; projectId?: string; transactionHash?: string } = {}) => {
      await supabase.rpc("relayer_heartbeat_update", {
        next_seen_at: new Date().toISOString(),
        next_success_at: input.success ? new Date().toISOString() : null,
        next_error: input.error ?? null,
        next_project_id: input.projectId ?? null,
        next_transaction_hash: input.transactionHash ?? null,
      });
    };
    await heartbeat();

    const { data: projects, error: projectError } = await supabase
      .from("projects")
      .select("id, goal_tx, owner_wallet_address")
      .eq("status", "approved_pending_chain")
      .order("created_at", { ascending: true });
    if (projectError) throw projectError;
    const { data: rate, error: rateError } = await supabase
      .from("tx_exchange_rates")
      .select("tx_usd_rate")
      .eq("id", true)
      .single();
    if (rateError) throw rateError;
    const txUsdRate = Number(rate.tx_usd_rate);

    const results: Array<{ id: string; status: string; txHash?: string; error?: string }> = [];
    for (const project of projects ?? []) {
      if (!project.owner_wallet_address) {
        results.push({ id: project.id, status: "skipped", error: "owner wallet is missing" });
        continue;
      }
      try {
        let transactionHash: string | undefined;
        try {
          const existing = await chain.queryContractSmart(contractAddress, { project: { project_id: project.id } }) as { status?: string };
          if (!existing?.status) throw new Error("On-chain project record is incomplete");
        } catch {
          const result = await chain.execute(
            account.address,
            contractAddress,
            {
              register_project: {
                project: {
                  id: project.id,
                  goal_micro_tx: String(Math.round((Number(project.goal_tx) / txUsdRate) * 1_000_000)),
                  status: "active",
                  metadata_token_id: "",
                  beneficiary: project.owner_wallet_address,
                },
              },
            },
            { amount: [{ denom: nativeDenom, amount: "50000" }], gas: "1000000" },
            "SoundFaith edge relayer registration",
          );
          transactionHash = result.transactionHash;
        }
        const { error: activateError } = await supabase.rpc("relayer_activate_project", {
          target_project_id: project.id,
        });
        if (activateError) throw activateError;
        await heartbeat({ success: true, projectId: project.id, transactionHash });
        results.push({ id: project.id, status: "active", txHash: transactionHash });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await heartbeat({ error: message, projectId: project.id });
        results.push({ id: project.id, status: "failed", error: message });
      }
    }

    return json({ relayer: account.address, chainId, processed: results });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
