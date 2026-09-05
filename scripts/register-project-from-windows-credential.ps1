param(
  [Parameter(Mandatory=$true)][string]$ProjectId,
  [Parameter(Mandatory=$true)][decimal]$GoalTx,
  [string]$Beneficiary = 'testcore15xhvchxtkstyhqvpl8pdcfkj69khfp0t8rmhxv',
  [string]$ContractAddress = 'testcore1896fkkzeuwlnmaqc422daktfetjww2a8dg0tes2d36nq4day4rzs4424ey',
  [string]$Target = 'soundfaith-wallet-devnet',
  [string]$Username = 'mnemonic'
)
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class WindowsCredentialRegister {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] private struct CREDENTIAL { public int Flags; public int Type; public IntPtr TargetName; public IntPtr Comment; public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten; public int CredentialBlobSize; public IntPtr CredentialBlob; public int Persist; public int AttributeCount; public IntPtr Attributes; public IntPtr TargetAlias; public IntPtr UserName; }
  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)] private static extern bool CredRead(string target, int type, int reservedFlag, out IntPtr credential);
  [DllImport("advapi32.dll", SetLastError = true)] private static extern void CredFree(IntPtr credential);
  public static string Read(string target, string username) { IntPtr pointer; if (!CredRead(target, 1, 0, out pointer)) throw new InvalidOperationException("Credential not found."); try { var c = Marshal.PtrToStructure<CREDENTIAL>(pointer); if (c.UserName != IntPtr.Zero && Marshal.PtrToStringUni(c.UserName) != username) { throw new InvalidOperationException("Credential username mismatch."); } return c.CredentialBlobSize == 0 ? "" : Marshal.PtrToStringUni(c.CredentialBlob, c.CredentialBlobSize / 2); } finally { CredFree(pointer); } }
}
'@
$mnemonic = [WindowsCredentialRegister]::Read($Target, $Username)
try {
  $env:COREUM_MNEMONIC = $mnemonic
  $env:COREUM_DONATION_CONTRACT = $ContractAddress
  $env:COREUM_PROJECT_ID = $ProjectId
  $env:COREUM_PROJECT_GOAL_TX = $GoalTx
  $env:COREUM_PROJECT_BENEFICIARY = $Beneficiary
  $env:COREUM_NATIVE_DENOM = 'utestcore'
  $env:COREUM_RPC_URL = 'https://rpc.testnet-1.tx.org:443'
  $env:COREUM_CHAIN_ID = 'coreum-testnet-1'
  $env:COREUM_BECH32_PREFIX = 'testcore'
  $env:COREUM_DERIVATION_PATH = "m/44'/990'/0'/0/0"
  npm run coreum:register
} finally {
  Remove-Item Env:COREUM_MNEMONIC, Env:COREUM_DONATION_CONTRACT, Env:COREUM_PROJECT_ID, Env:COREUM_PROJECT_GOAL_TX, Env:COREUM_PROJECT_BENEFICIARY, Env:COREUM_NATIVE_DENOM, Env:COREUM_RPC_URL, Env:COREUM_CHAIN_ID, Env:COREUM_DERIVATION_PATH -ErrorAction SilentlyContinue
}
