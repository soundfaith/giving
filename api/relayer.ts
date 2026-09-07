import type { IncomingMessage, ServerResponse } from "node:http";

function send(response: ServerResponse, status: number, body: unknown) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(body));
}

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== "GET" && request.method !== "POST") {
    send(response, 405, { error: "Method not allowed" });
    return;
  }

  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && request.headers.authorization !== `Bearer ${cronSecret}`) {
    send(response, 401, { error: "Unauthorized" });
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const relayerSecret = process.env.RELAYER_CRON_SECRET;
  if (!supabaseUrl || !relayerSecret) {
    send(response, 500, { error: "Relayer environment is not configured" });
    return;
  }

  try {
    const relayerResponse = await fetch(`${supabaseUrl}/functions/v1/coreum-relayer`, {
      method: "POST",
      headers: { "x-relayer-secret": relayerSecret },
    });
    const body = await relayerResponse.json().catch(() => ({}));
    send(response, relayerResponse.status, body);
  } catch (error) {
    send(response, 502, { error: error instanceof Error ? error.message : String(error) });
  }
}
