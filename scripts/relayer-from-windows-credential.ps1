param(
  [string]$Target = 'soundfaith-wallet-devnet',
  [string]$Username = 'mnemonic',
  [string]$ProjectRef = 'gqnrvnsoyhirpvcvxapl',
  [switch]$Once
)

$repoRoot = Split-Path -Parent $PSScriptRoot
Push-Location $repoRoot

Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class SoundFaithRelayerCredentialWrapper {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] private struct CREDENTIAL { public int Flags; public int Type; public IntPtr TargetName; public IntPtr Comment; public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten; public int CredentialBlobSize; public IntPtr CredentialBlob; public int Persist; public int AttributeCount; public IntPtr Attributes; public IntPtr TargetAlias; public IntPtr UserName; }
  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)] private static extern bool CredRead(string target, int type, int reservedFlag, out IntPtr credential);
  [DllImport("advapi32.dll", SetLastError = true)] private static extern void CredFree(IntPtr credential);
  public static string Read(string target, string username) { IntPtr pointer; if (!CredRead(target, 1, 0, out pointer)) throw new InvalidOperationException("Credential not found."); try { var c = Marshal.PtrToStructure<CREDENTIAL>(pointer); if (c.UserName != IntPtr.Zero && Marshal.PtrToStringUni(c.UserName) != username) throw new InvalidOperationException("Credential username mismatch."); return c.CredentialBlobSize == 0 ? "" : Marshal.PtrToStringUni(c.CredentialBlob, c.CredentialBlobSize / 2); } finally { CredFree(pointer); } }
}
'@

$envFile = Get-Content .env.local
$env:VITE_SUPABASE_URL = (($envFile | Where-Object { $_ -match '^VITE_SUPABASE_URL=' }) -split '=', 2)[1]
$env:COREUM_DONATION_CONTRACT = (($envFile | Where-Object { $_ -match '^VITE_COREUM_DONATION_CONTRACT=' }) -split '=', 2)[1]
$keys = supabase projects api-keys --project-ref $ProjectRef --reveal --output json | ConvertFrom-Json
$serviceKeyEntry = $keys | Where-Object { $_.name -eq 'service_role' } | Select-Object -First 1
$env:SUPABASE_SERVICE_ROLE_KEY = if ($serviceKeyEntry.api_key) { $serviceKeyEntry.api_key } else { $serviceKeyEntry.key }
if (-not $env:VITE_SUPABASE_URL -or -not $env:COREUM_DONATION_CONTRACT -or -not $env:SUPABASE_SERVICE_ROLE_KEY) { throw 'Supabase or Coreum deployment configuration is incomplete.' }

$env:COREUM_MNEMONIC = [SoundFaithRelayerCredentialWrapper]::Read($Target, $Username)
$env:COREUM_RPC_URL = 'https://rpc.testnet-1.tx.org:443'
$env:COREUM_CHAIN_ID = 'coreum-testnet-1'
$env:COREUM_BECH32_PREFIX = 'testcore'
$env:COREUM_DERIVATION_PATH = "m/44'/990'/0'/0/0"
$env:COREUM_NATIVE_DENOM = 'utestcore'
if ($Once) { $env:COREUM_RELAYER_ONCE = '1' }

try {
  npm run coreum:relayer
} finally {
  Remove-Item Env:COREUM_MNEMONIC, Env:SUPABASE_SERVICE_ROLE_KEY, Env:VITE_SUPABASE_URL, Env:COREUM_DONATION_CONTRACT, Env:COREUM_RPC_URL, Env:COREUM_CHAIN_ID, Env:COREUM_BECH32_PREFIX, Env:COREUM_DERIVATION_PATH, Env:COREUM_NATIVE_DENOM, Env:COREUM_RELAYER_ONCE -ErrorAction SilentlyContinue
  Pop-Location
}