param(
  [string]$Target = 'soundfaith-wallet-devnet',
  [string]$Username = 'mnemonic',
  [string]$ProjectRef = 'gqnrvnsoyhirpvcvxapl',
  [Parameter(Mandatory=$true)][string]$DonorMnemonicsBase64
)

$repoRoot = Split-Path -Parent $PSScriptRoot
Push-Location $repoRoot

Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class SoundFaithMvpCredential {
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
$env:COREUM_OWNER_MNEMONIC = [SoundFaithMvpCredential]::Read($Target, $Username)
$env:MVP_DONOR_MNEMONICS = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($DonorMnemonicsBase64))
$env:COREUM_RPC_URL = 'https://rpc.testnet-1.tx.org:443'
$env:COREUM_STAKING_VALIDATOR = 'testcorevaloper1eegug92k2gp9c6kqjsadk3tku29sr2rsryjszy'

try {
  npx tsx scripts/seed-mvp.ts
} finally {
  Remove-Item Env:VITE_SUPABASE_URL, Env:SUPABASE_SERVICE_ROLE_KEY, Env:COREUM_DONATION_CONTRACT, Env:COREUM_OWNER_MNEMONIC, Env:MVP_DONOR_MNEMONICS, Env:COREUM_RPC_URL, Env:COREUM_STAKING_VALIDATOR -ErrorAction SilentlyContinue
  Pop-Location
}