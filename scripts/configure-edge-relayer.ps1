Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class SoundFaithEdgeCredentialWrapper {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] private struct CREDENTIAL { public int Flags; public int Type; public IntPtr TargetName; public IntPtr Comment; public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten; public int CredentialBlobSize; public IntPtr CredentialBlob; public int Persist; public int AttributeCount; public IntPtr Attributes; public IntPtr TargetAlias; public IntPtr UserName; }
  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)] private static extern bool CredRead(string target, int type, int reservedFlag, out IntPtr credential);
  [DllImport("advapi32.dll", SetLastError = true)] private static extern void CredFree(IntPtr credential);
  public static string Read(string target, string username) { IntPtr pointer; if (!CredRead(target, 1, 0, out pointer)) throw new InvalidOperationException("Credential not found."); try { var c = Marshal.PtrToStructure<CREDENTIAL>(pointer); if (c.UserName != IntPtr.Zero && Marshal.PtrToStringUni(c.UserName) != username) throw new InvalidOperationException("Credential username mismatch."); return c.CredentialBlobSize == 0 ? "" : Marshal.PtrToStringUni(c.CredentialBlob, c.CredentialBlobSize / 2); } finally { CredFree(pointer); } }
}
'@

$envFile = Get-Content .env.local
$supabaseUrl = (($envFile | Where-Object { $_ -match '^VITE_SUPABASE_URL=' }) -split '=', 2)[1]
$contract = (($envFile | Where-Object { $_ -match '^VITE_COREUM_DONATION_CONTRACT=' }) -split '=', 2)[1]
$keys = supabase projects api-keys --project-ref gqnrvnsoyhirpvcvxapl --reveal --output json | ConvertFrom-Json
$serviceKey = (($keys | Where-Object { $_.name -eq 'service_role' } | Select-Object -First 1).api_key)
$mnemonic = [SoundFaithEdgeCredentialWrapper]::Read('soundfaith-wallet-devnet', 'mnemonic')
$cronSecret = [Guid]::NewGuid().ToString('N') + [Guid]::NewGuid().ToString('N')
if (-not $serviceKey -or -not $supabaseUrl -or -not $contract -or -not $mnemonic) { throw 'Required deployment value is missing.' }

supabase secrets set --project-ref gqnrvnsoyhirpvcvxapl "COREUM_MNEMONIC=$mnemonic" "COREUM_DONATION_CONTRACT=$contract" "SUPABASE_URL=$supabaseUrl" "SUPABASE_SERVICE_ROLE_KEY=$serviceKey" "RELAYER_CRON_SECRET=$cronSecret" COREUM_RPC_URL=https://rpc.testnet-1.tx.org:443 COREUM_CHAIN_ID=coreum-testnet-1 COREUM_BECH32_PREFIX=testcore COREUM_DERIVATION_PATH="m/44'/990'/0'/0/0" COREUM_NATIVE_DENOM=utestcore
$sql = @'
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;
create table if not exists public.relayer_runtime_secrets (
  id boolean primary key default true check (id),
  invocation_secret text not null,
  updated_at timestamptz not null default now()
);
alter table public.relayer_runtime_secrets enable row level security;
revoke all on public.relayer_runtime_secrets from public, anon, authenticated;
insert into public.relayer_runtime_secrets (id, invocation_secret)
values (true, '__RELAYER_SECRET__')
on conflict (id) do update set invocation_secret = excluded.invocation_secret, updated_at = now();
do $job$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'soundfaith-edge-relayer';
exception when undefined_table then null;
end $job$;
select cron.schedule(
  'soundfaith-edge-relayer',
  '* * * * *',
  $$select net.http_post(
    url := 'https://gqnrvnsoyhirpvcvxapl.supabase.co/functions/v1/coreum-relayer',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-relayer-secret', (select invocation_secret from public.relayer_runtime_secrets where id = true)),
    body := '{}'::jsonb
  );$$
);
'@
$sql = $sql.Replace('__RELAYER_SECRET__', $cronSecret)
supabase db query --linked $sql | Out-Null
Write-Output 'Configured Edge relayer secrets.'
Write-Output 'Scheduled Edge relayer every minute.'
