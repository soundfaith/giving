param(
  [string]$Target = 'soundfaith-wallet-devnet',
  [string]$Username = 'mnemonic',
  [string]$ContractAddress = 'testcore18wsejajlp9flsdymm5j6xutuwkumrvg7twuz9rzwyf7cnq040fpqluslfg',
  [string]$Validator = 'testcorevaloper1eegug92k2gp9c6kqjsadk3tku29sr2rsryjszy',
  [string]$Beneficiary = 'testcore15xhvchxtkstyhqvpl8pdcfkj69khfp0t8rmhxv'
)

Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class WindowsCredentialSeed {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] private struct CREDENTIAL { public int Flags; public int Type; public IntPtr TargetName; public IntPtr Comment; public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten; public int CredentialBlobSize; public IntPtr CredentialBlob; public int Persist; public int AttributeCount; public IntPtr Attributes; public IntPtr TargetAlias; public IntPtr UserName; }
  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)] private static extern bool CredRead(string target, int type, int reservedFlag, out IntPtr credential);
  [DllImport("advapi32.dll", SetLastError = true)] private static extern void CredFree(IntPtr credential);
  public static string Read(string target, string username) { IntPtr pointer; if (!CredRead(target, 1, 0, out pointer)) throw new InvalidOperationException("Credential not found."); try { var c = Marshal.PtrToStructure<CREDENTIAL>(pointer); if (c.UserName != IntPtr.Zero && Marshal.PtrToStringUni(c.UserName) != username) throw new InvalidOperationException("Credential username mismatch."); return c.CredentialBlobSize == 0 ? "" : Marshal.PtrToStringUni(c.CredentialBlob, c.CredentialBlobSize / 2); } finally { CredFree(pointer); } }
}
'@

$mnemonic = [WindowsCredentialSeed]::Read($Target, $Username)
try {
  $env:COREUM_MNEMONIC = $mnemonic
  $env:COREUM_DONATION_CONTRACT = $ContractAddress
  $env:COREUM_STAKING_VALIDATOR = $Validator
  $env:COREUM_PROJECT_BENEFICIARY = $Beneficiary
  npm run coreum:seed:samples
} finally {
  Remove-Item Env:COREUM_MNEMONIC, Env:COREUM_DONATION_CONTRACT, Env:COREUM_STAKING_VALIDATOR, Env:COREUM_PROJECT_BENEFICIARY -ErrorAction SilentlyContinue
}
