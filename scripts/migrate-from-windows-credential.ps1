param(
  [int]$CodeId,
  [string]$ContractAddress = 'testcore1896fkkzeuwlnmaqc422daktfetjww2a8dg0tes2d36nq4day4rzs4424ey',
  [string]$Target = 'soundfaith-wallet-devnet',
  [string]$Username = 'mnemonic',
  [string]$ExpectedAddress = 'testcore15xhvchxtkstyhqvpl8pdcfkj69khfp0t8rmhxv'
)

if (-not $CodeId) { throw 'Pass the new code ID with -CodeId.' }
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class WindowsCredentialMigrate {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] private struct CREDENTIAL { public int Flags; public int Type; public IntPtr TargetName; public IntPtr Comment; public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten; public int CredentialBlobSize; public IntPtr CredentialBlob; public int Persist; public int AttributeCount; public IntPtr Attributes; public IntPtr TargetAlias; public IntPtr UserName; }
  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)] private static extern bool CredRead(string target, int type, int reservedFlag, out IntPtr credential);
  [DllImport("advapi32.dll", SetLastError = true)] private static extern void CredFree(IntPtr credential);
  public static string Read(string target, string username) { IntPtr pointer; if (!CredRead(target, 1, 0, out pointer)) throw new InvalidOperationException("Credential not found."); try { var c = Marshal.PtrToStructure<CREDENTIAL>(pointer); if (c.UserName != IntPtr.Zero && Marshal.PtrToStringUni(c.UserName) != username) throw new InvalidOperationException("Credential username mismatch."); return c.CredentialBlobSize == 0 ? "" : Marshal.PtrToStringUni(c.CredentialBlob, c.CredentialBlobSize / 2); } finally { CredFree(pointer); } }
}
'@

$mnemonic = [WindowsCredentialMigrate]::Read($Target, $Username)
try {
  $env:COREUM_MNEMONIC = $mnemonic
  $env:COREUM_DONATION_CONTRACT = $ContractAddress
  $env:COREUM_MIGRATE_CODE_ID = $CodeId
  $env:COREUM_BECH32_PREFIX = 'testcore'
  $env:COREUM_DERIVATION_PATH = "m/44'/990'/0'/0/0"
  $env:COREUM_EXPECTED_ADDRESS = $ExpectedAddress
  npm run coreum:migrate
} finally {
  Remove-Item Env:COREUM_MNEMONIC, Env:COREUM_DONATION_CONTRACT, Env:COREUM_MIGRATE_CODE_ID, Env:COREUM_DERIVATION_PATH, Env:COREUM_EXPECTED_ADDRESS -ErrorAction SilentlyContinue
}
