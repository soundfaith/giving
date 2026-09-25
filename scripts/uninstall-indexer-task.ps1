param(
  [string]$TaskName = 'SoundFaith Coreum Indexer'
)

Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
Write-Output "Removed: $TaskName"