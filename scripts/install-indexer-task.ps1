param(
  [string]$TaskName = 'SoundFaith Coreum Indexer'
)

$repoRoot = Split-Path -Parent $PSScriptRoot
$indexerScript = Join-Path $repoRoot 'scripts\indexer-from-windows-credential.ps1'
$powershell = (Get-Command powershell.exe).Source

if (-not (Test-Path $indexerScript)) { throw "Indexer script not found: $indexerScript" }

$action = New-ScheduledTaskAction -Execute $powershell -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$indexerScript`""
$trigger = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 10 -RestartInterval (New-TimeSpan -Minutes 1)
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
Start-ScheduledTask -TaskName $TaskName
Write-Output "Installed and started: $TaskName"