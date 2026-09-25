param(
  [string]$Target = 'soundfaith-wallet-devnet',
  [string]$Username = 'mnemonic',
  [string]$ExpectedAddress = 'testcore15xhvchxtkstyhqvpl8pdcfkj69khfp0t8rmhxv',
  [switch]$UploadOnly,
  [switch]$CheckOnly,
  [string]$WasmPath = '.\contracts\donation\target\wasm32-unknown-unknown\release\soundfaith_donation.optimized.wasm',
  [string]$InstantiatePath = '.\contracts\donation\instantiate.testnet.json'
)

if (-not (Test-Path $WasmPath)) { throw "WASM file not found: $WasmPath" }
if (-not (Test-Path $InstantiatePath)) { throw "Instantiate file not found: $InstantiatePath" }

Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class WindowsCredential {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  private struct CREDENTIAL { public int Flags; public int Type; public IntPtr TargetName; public IntPtr Comment; public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten; public int CredentialBlobSize; public IntPtr CredentialBlob; public int Persist; public int AttributeCount; public IntPtr Attributes; public IntPtr TargetAlias; public IntPtr UserName; }
  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)] private static extern bool CredRead(string target, int type, int reservedFlag, out IntPtr credential);
  [DllImport("advapi32.dll", SetLastError = true)] private static extern void CredFree(IntPtr credential);
  public static string Read(string target, string username) {
    IntPtr pointer;
    if (!CredRead(target, 1, 0, out pointer)) throw new InvalidOperationException("Credential not found. Check Windows Credential Manager target and username.");
    try {
      var credential = Marshal.PtrToStructure<CREDENTIAL>(pointer);
      var value = credential.CredentialBlobSize == 0 ? "" : Marshal.PtrToStringUni(credential.CredentialBlob, credential.CredentialBlobSize / 2);
      if (credential.UserName != IntPtr.Zero && Marshal.PtrToStringUni(credential.UserName) != username) { throw new InvalidOperationException("Credential username does not match the requested username."); }
      return value;
    } finally { CredFree(pointer); }
  }
}
'@

$mnemonic = [WindowsCredential]::Read($Target, $Username)
try {
  $env:COREUM_MNEMONIC = $mnemonic
  $env:COREUM_INSTANTIATE_MSG = Get-Content $InstantiatePath -Raw
  $env:COREUM_BECH32_PREFIX = 'testcore'
  $env:COREUM_DERIVATION_PATH = "m/44'/990'/0'/0/0"
  $env:COREUM_EXPECTED_ADDRESS = $ExpectedAddress
  $env:COREUM_CHAIN_ID = 'coreum-testnet-1'
  $env:COREUM_NETWORK = 'testnet'
  if ($CheckOnly) { npm run coreum:deploy -- --wasm $WasmPath --check-only }
  elseif ($UploadOnly) { npm run coreum:deploy -- --wasm $WasmPath --upload-only }
  else { npm run coreum:deploy -- --wasm $WasmPath }
} finally {
  Remove-Item Env:COREUM_MNEMONIC -ErrorAction SilentlyContinue
  Remove-Item Env:COREUM_INSTANTIATE_MSG -ErrorAction SilentlyContinue
  Remove-Item Env:COREUM_EXPECTED_ADDRESS -ErrorAction SilentlyContinue
  Remove-Item Env:COREUM_DERIVATION_PATH -ErrorAction SilentlyContinue
}
