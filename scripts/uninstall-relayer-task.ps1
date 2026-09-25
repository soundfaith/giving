param(
  [string]$TaskName = 'SoundFaith Coreum Relayer'
)

Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
Write-Output "Removed: $TaskName"