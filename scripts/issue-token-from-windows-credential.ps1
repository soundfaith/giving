param(
  [string]$Target = 'soundfaith-wallet-devnet',
  [string]$Username = 'mnemonic',
  [string]$ExpectedAddress = 'testcore15xhvchxtkstyhqvpl8pdcfkj69khfp0t8rmhxv'
)

Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class WindowsCredentialToken {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  private struct CREDENTIAL { public int Flags; public int Type; public IntPtr TargetName; public IntPtr Comment; public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten; public int CredentialBlobSize; public IntPtr CredentialBlob; public int Persist; public int AttributeCount; public IntPtr Attributes; public IntPtr TargetAlias; public IntPtr UserName; }
  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)] private static extern bool CredRead(string target, int type, int reservedFlag, out IntPtr credential);
  [DllImport("advapi32.dll", SetLastError = true)] private static extern void CredFree(IntPtr credential);
  public static string Read(string target, string username) {
    IntPtr pointer;
    if (!CredRead(target, 1, 0, out pointer)) { throw new InvalidOperationException("Credential not found."); }
    try {
      var credential = Marshal.PtrToStructure<CREDENTIAL>(pointer);
      if (credential.UserName != IntPtr.Zero && Marshal.PtrToStringUni(credential.UserName) != username) { throw new InvalidOperationException("Credential username mismatch."); }
      return credential.CredentialBlobSize == 0 ? "" : Marshal.PtrToStringUni(credential.CredentialBlob, credential.CredentialBlobSize / 2);
    } finally { CredFree(pointer); }
  }
}
'@

$mnemonic = [WindowsCredentialToken]::Read($Target, $Username)
try {
  $env:COREUM_MNEMONIC = $mnemonic
  $env:COREUM_BECH32_PREFIX = 'testcore'
  $env:COREUM_DERIVATION_PATH = "m/44'/990'/0'/0/0"
  $env:COREUM_EXPECTED_ADDRESS = $ExpectedAddress
  npm run coreum:token:issue
} finally {
  Remove-Item Env:COREUM_MNEMONIC, Env:COREUM_EXPECTED_ADDRESS, Env:COREUM_DERIVATION_PATH -ErrorAction SilentlyContinue
}