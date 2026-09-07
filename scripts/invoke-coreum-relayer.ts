import process from "node:process";

const endpoint = process.env.COREUM_RELAYER_URL ?? "http://127.0.0.1:54321/functions/v1/coreum-relayer";
const secret = process.env.RELAYER_CRON_SECRET ?? "";
const intervalMs = Number(process.env.COREUM_RELAYER_POLL_MS ?? 10_000);

if (!secret) throw new Error("RELAYER_CRON_SECRET is required");

async function invoke() {
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "x-relayer-secret": secret },
    });
    const body = await response.text();
    if (!response.ok) throw new Error(`${response.status}: ${body}`);
    console.log(new Date().toISOString(), body);
  } catch (error) {
    console.error(new Date().toISOString(), error);
  }
}

await invoke();
setInterval(() => void invoke(), intervalMs);
