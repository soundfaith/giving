import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const requiredEnv = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured`);
  return value;
};

type TxKycResponse = {
  ExternalUserID?: string;
  Status?: number | string;
};

function normalizeStatus(status: TxKycResponse["Status"]): "pending" | "approved" | "rejected" {
  if (status === 2 || String(status).toUpperCase() === "APPROVED") return "approved";
  if ([3, 4, 7, 8].includes(Number(status)) || ["ADMIN_DENIED", "REJECTED", "NOT_PROCESSABLE_FOREVER", "FIX_REQUIRED"].includes(String(status).toUpperCase())) return "rejected";
  return "pending";
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "POST required" }, 405);

  try {
    const supabaseAuthorization = request.headers.get("Authorization");
    const txAuthorization = request.headers.get("X-TX-Authorization");
    if (!supabaseAuthorization) return json({ error: "Authorization required" }, 401);
    if (!txAuthorization) return json({ error: "X-TX-Authorization required" }, 401);

    const supabase = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
      global: { headers: { Authorization: supabaseAuthorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return json({ error: "Authentication required" }, 401);

    const body = await request.json() as { externalUserId?: string; walletAddress?: string };
    const externalUserId = body.externalUserId?.trim();
    const walletAddress = body.walletAddress?.trim();
    if (!externalUserId || !walletAddress) return json({ error: "externalUserId and walletAddress are required" }, 400);

    const txResponse = await fetch(`${Deno.env.get("TX_KYC_BASE_URL") ?? "https://com-be-kyc-service-zk6dps4acq-uc.a.run.app"}/kyc/get?external_user_id=${encodeURIComponent(externalUserId)}`, {
      headers: {
        "Content-Type": "application/json",
        "Authorization": txAuthorization.startsWith("Bearer ") ? txAuthorization : `Bearer ${txAuthorization}`,
        "Network": Deno.env.get("TX_NETWORK") ?? "testnet",
      },
    });
    if (!txResponse.ok) return json({ error: `TX KYC lookup failed with status ${txResponse.status}` }, 502);

    const txKyc = await txResponse.json() as TxKycResponse;
    const status = normalizeStatus(txKyc.Status);
    const { error: upsertError } = await supabase.from("identity_verifications").upsert({
      user_id: user.id,
      wallet_address: walletAddress,
      externaluserid: externalUserId,
      kyc_status: status,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    if (upsertError) throw upsertError;

    return json({ externaluserid: externalUserId, kyc_status: status });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
