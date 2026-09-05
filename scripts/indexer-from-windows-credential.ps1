param(
  [string]$Target = 'soundfaith-wallet-devnet',
  [string]$Username = 'mnemonic',
  [string]$ProjectRef = 'gqnrvnsoyhirpvcvxapl',
  [switch]$Once
)

$repoRoot = Split-Path -Parent $PSScriptRoot
Push-Location $repoRoot

$envFile = Get-Content .env.local
$env:VITE_SUPABASE_URL = (($envFile | Where-Object { $_ -match '^VITE_SUPABASE_URL=' }) -split '=', 2)[1]
$env:COREUM_DONATION_CONTRACT = (($envFile | Where-Object { $_ -match '^VITE_COREUM_DONATION_CONTRACT=' }) -split '=', 2)[1]
$keys = supabase projects api-keys --project-ref $ProjectRef --reveal --output json | ConvertFrom-Json
$serviceKeyEntry = $keys | Where-Object { $_.name -eq 'service_role' } | Select-Object -First 1
$env:SUPABASE_SERVICE_ROLE_KEY = if ($serviceKeyEntry.api_key) { $serviceKeyEntry.api_key } else { $serviceKeyEntry.key }
if (-not $env:VITE_SUPABASE_URL -or -not $env:COREUM_DONATION_CONTRACT -or -not $env:SUPABASE_SERVICE_ROLE_KEY) { throw 'Supabase or Coreum deployment configuration is incomplete.' }

$env:COREUM_RPC_URL = 'https://rpc.testnet-1.tx.org:443'
$env:COREUM_NETWORK = 'testnet'
if ($Once) { $env:COREUM_INDEXER_ONCE = '1' }

try {
  npm run coreum:indexer
} finally {
  Remove-Item Env:SUPABASE_SERVICE_ROLE_KEY, Env:VITE_SUPABASE_URL, Env:COREUM_DONATION_CONTRACT, Env:COREUM_RPC_URL, Env:COREUM_NETWORK, Env:COREUM_INDEXER_ONCE -ErrorAction SilentlyContinue
  Pop-Location
}