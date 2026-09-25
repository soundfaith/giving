param(
  [string]$TaskName = 'SoundFaith Coreum Relayer'
)

$repoRoot = Split-Path -Parent $PSScriptRoot
$relayerScript = Join-Path $repoRoot 'scripts\relayer-from-windows-credential.ps1'
$powershell = (Get-Command powershell.exe).Source

if (-not (Test-Path $relayerScript)) { throw "Relayer script not found: $relayerScript" }

$action = New-ScheduledTaskAction -Execute $powershell -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$relayerScript`""
$trigger = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 10 -RestartInterval (New-TimeSpan -Minutes 1)
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
Start-ScheduledTask -TaskName $TaskName
Write-Output "Installed and started: $TaskName"
Write-Output "The relayer will start again when this Windows user logs in."