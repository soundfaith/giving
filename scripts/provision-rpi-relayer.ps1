$ErrorActionPreference = 'Stop'

Import-Module Posh-SSH

Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class SoundFaithCredentialReader {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] public struct CREDENTIAL { public int Flags; public int Type; public IntPtr TargetName; public IntPtr Comment; public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten; public int CredentialBlobSize; public IntPtr CredentialBlob; public int Persist; public int AttributeCount; public IntPtr Attributes; public IntPtr TargetAlias; public IntPtr UserName; }
  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)] public static extern bool CredRead(string target, int type, int reserved, out IntPtr credential);
  [DllImport("advapi32.dll")] public static extern void CredFree(IntPtr credential);
}
'@

function Get-StoredSecret([string]$Target, [string]$Username) {
  $pointer = [IntPtr]::Zero
  if (-not [SoundFaithCredentialReader]::CredRead($Target, 1, 0, [ref]$pointer)) { throw "Credential not found: $Target" }
  try {
    $credential = [Runtime.InteropServices.Marshal]::PtrToStructure($pointer, [type][SoundFaithCredentialReader+CREDENTIAL])
    $actualUsername = [Runtime.InteropServices.Marshal]::PtrToStringUni($credential.UserName)
    if ($actualUsername -ne $Username) { throw "Credential username mismatch for $Target" }
    [Runtime.InteropServices.Marshal]::PtrToStringUni($credential.CredentialBlob, $credential.CredentialBlobSize / 2)
  } finally {
    [SoundFaithCredentialReader]::CredFree($pointer)
  }
}

function Invoke-Remote([int]$SessionId, [string]$Command) {
  Write-Host "-> $Command"
  $result = Invoke-SSHCommand -SessionId $SessionId -Command $Command -TimeOut 600000
  if ($result.ExitStatus -ne 0) { throw "Remote command failed ($($result.ExitStatus)): $($result.Error)" }
  if ($result.Output) { $result.Output }
}

$root = Split-Path -Parent $PSScriptRoot
$envLines = Get-Content (Join-Path $root '.env.local')
$supabaseUrl = (($envLines | Where-Object { $_ -match '^VITE_SUPABASE_URL=' }) -split '=', 2)[1]
$contract = (($envLines | Where-Object { $_ -match '^VITE_COREUM_DONATION_CONTRACT=' }) -split '=', 2)[1]
$serviceKeys = supabase projects api-keys --project-ref gqnrvnsoyhirpvcvxapl --reveal --output json | ConvertFrom-Json
$serviceEntry = $serviceKeys | Where-Object { $_.name -eq 'service_role' } | Select-Object -First 1
$serviceKey = if ($serviceEntry.api_key) { $serviceEntry.api_key } else { $serviceEntry.key }
$mnemonic = Get-StoredSecret 'soundfaith-wallet-devnet' 'mnemonic'
$piPassword = Get-StoredSecret 'raspberry-pi' 'soundfaith'

if (-not $supabaseUrl -or -not $contract -or -not $serviceKey -or -not $mnemonic) { throw 'Required deployment configuration is missing.' }

$securePassword = ConvertTo-SecureString $piPassword -AsPlainText -Force
$credential = [PSCredential]::new('soundfaith', $securePassword)
$emptyKeyPassword = [System.Security.SecureString]::new()
$keyCredential = [PSCredential]::new('soundfaith', $emptyKeyPassword)
$keyFile = Join-Path $env:USERPROFILE '.ssh\id_ed25519'
$session = New-SSHSession -ComputerName '192.168.1.35' -Credential $keyCredential -KeyFile $keyFile -AcceptKey -ConnectionTimeout 15000
if (-not $session) { throw 'Could not connect to the Raspberry Pi.' }
$sessionId = $session.SessionId

try {
  $passwordBytes = [Text.Encoding]::UTF8.GetBytes($piPassword)
  $passwordB64 = [Convert]::ToBase64String($passwordBytes)
  function Invoke-Sudo([string]$Command) {
    Write-Host '-> sudo command'
    $result = Invoke-SSHCommand -SessionId $sessionId -Command "printf '%s' '$passwordB64' | base64 -d | sudo -S -p '' bash -c '$Command'" -TimeOut 600000
    if ($result.ExitStatus -ne 0) { throw "Remote sudo command failed ($($result.ExitStatus)): $($result.Error)" }
    if ($result.Output) { $result.Output }
  }

  Invoke-Remote $sessionId 'printf "SSH authenticated: %s (%s)\n" "$USER" "$(uname -m)"'
  Invoke-Sudo 'apt-get update && DEBIAN_FRONTEND=noninteractive apt-get full-upgrade -y && DEBIAN_FRONTEND=noninteractive apt-get install -y curl ca-certificates build-essential unattended-upgrades'
  Invoke-Sudo 'systemctl enable --now unattended-upgrades; mkdir -p /opt/soundfaith; chown -R soundfaith:soundfaith /opt/soundfaith'
  Invoke-Sudo 'curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs'

  $stage = Join-Path $env:TEMP ('soundfaith-relayer-' + [Guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $stage | Out-Null
  try {
    Copy-Item (Join-Path $root 'scripts\coreum-relayer.ts') $stage
    Copy-Item (Join-Path $root 'package.json') $stage
    Copy-Item (Join-Path $root 'package-lock.json') $stage
    Copy-Item (Join-Path $root 'tsconfig.scripts.json') $stage
    Get-ChildItem $stage -File | ForEach-Object {
      Set-SCPItem -ComputerName '192.168.1.35' -Credential $keyCredential -KeyFile $keyFile -Path $_.FullName -Destination '/tmp' -AcceptKey
    }
  } finally {
    Remove-Item $stage -Recurse -Force -ErrorAction SilentlyContinue
  }
  Invoke-Sudo 'install -d -o soundfaith -g soundfaith /opt/soundfaith/scripts; cp /tmp/coreum-relayer.ts /opt/soundfaith/scripts/; cp /tmp/package.json /tmp/package-lock.json /tmp/tsconfig.scripts.json /opt/soundfaith/; chown -R soundfaith:soundfaith /opt/soundfaith'
  Invoke-Remote $sessionId 'cd /opt/soundfaith && npm ci && npm run typecheck:scripts'

  $envContent = @"
COREUM_MNEMONIC=$mnemonic
COREUM_DONATION_CONTRACT=$contract
VITE_SUPABASE_URL=$supabaseUrl
SUPABASE_SERVICE_ROLE_KEY=$serviceKey
COREUM_RPC_URL=https://rpc.testnet-1.tx.org:443
COREUM_CHAIN_ID=coreum-testnet-1
COREUM_BECH32_PREFIX=testcore
COREUM_DERIVATION_PATH=m/44'/990'/0'/0/0
COREUM_NATIVE_DENOM=utestcore
COREUM_RELAYER_POLL_MS=10000
"@
  $envB64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($envContent))
  Invoke-Sudo "printf '%s' '$envB64' | base64 -d > /etc/soundfaith-relayer.env; chown root:root /etc/soundfaith-relayer.env; chmod 600 /etc/soundfaith-relayer.env"

  $unit = @'
[Unit]
Description=SoundFaith Coreum project relayer
Wants=network-online.target
After=network-online.target

[Service]
Type=simple
User=soundfaith
Group=soundfaith
WorkingDirectory=/opt/soundfaith
EnvironmentFile=/etc/soundfaith-relayer.env
ExecStart=/usr/bin/npm run coreum:relayer
Restart=always
RestartSec=15
TimeoutStopSec=30
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/soundfaith

[Install]
WantedBy=multi-user.target
'@
  $unitB64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($unit))
  Invoke-Sudo "printf '%s' '$unitB64' | base64 -d > /etc/systemd/system/soundfaith-relayer.service; systemctl daemon-reload; systemctl enable soundfaith-relayer"
  Invoke-Sudo 'systemctl stop soundfaith-relayer || true'
  Invoke-Sudo 'systemctl start soundfaith-relayer; systemctl is-enabled soundfaith-relayer; systemctl is-active soundfaith-relayer'
  Invoke-Sudo 'journalctl -u soundfaith-relayer -n 30 --no-pager'
} finally {
  Remove-SSHSession -SessionId $sessionId | Out-Null
  Remove-Variable piPassword, mnemonic, serviceKey, passwordB64, securePassword, credential, keyCredential -ErrorAction SilentlyContinue
}
