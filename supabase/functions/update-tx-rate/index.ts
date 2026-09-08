import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

const requiredEnv = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured`);
  return value;
};

type PriceResponse = { coreum?: { usd?: number } };

async function readTxUsdRate() {
  const endpoint = Deno.env.get("TX_PRICE_API_URL") ?? "https://api.coingecko.com/api/v3/simple/price?ids=coreum&vs_currencies=usd";
  const response = await fetch(endpoint, {
    headers: Deno.env.get("TX_PRICE_API_KEY") ? { "x-api-key": requiredEnv("TX_PRICE_API_KEY") } : undefined,
  });
  if (!response.ok) throw new Error(`TX price lookup failed with status ${response.status}`);
  const body = await response.json() as PriceResponse;
  const rate = Number(body.coreum?.usd);
  if (!Number.isFinite(rate) || rate <= 0) throw new Error("TX price provider returned an invalid USD rate");
  return rate;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "POST required" }, 405);

  try {
    const cronSecret = Deno.env.get("TX_RATE_CRON_SECRET");
    const suppliedSecret = request.headers.get("x-cron-secret");
    const authorization = request.headers.get("Authorization");
    const supabaseUrl = requiredEnv("SUPABASE_URL");
    const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    let authorizedByCron = Boolean(cronSecret && suppliedSecret === cronSecret);
    let userClient: ReturnType<typeof createClient> | null = null;

    if (!authorizedByCron) {
      if (!authorization?.startsWith("Bearer ")) return json({ error: "Authorization required" }, 401);
      userClient = createClient(supabaseUrl, serviceRoleKey, {
        global: { headers: { Authorization: authorization } },
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: { user }, error: userError } = await userClient.auth.getUser();
      if (userError || !user) return json({ error: "Authentication required" }, 401);
      const { data: isAdmin, error: adminError } = await userClient.rpc("is_soundfaith_admin");
      if (adminError || !isAdmin) return json({ error: "Admin access required" }, 403);
    }

    const txUsdRate = await readTxUsdRate();
    const databaseClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = authorizedByCron
      ? await databaseClient.from("tx_exchange_rates").upsert({ id: true, tx_usd_rate: txUsdRate, updated_at: new Date().toISOString() }).select("updated_at")
      : await userClient!.rpc("admin_set_tx_exchange_rate", { next_tx_usd_rate: txUsdRate });
    if (error) throw error;
    return json({ tx_usd_rate: txUsdRate, updated_at: data?.[0]?.updated_at ?? new Date().toISOString() });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});