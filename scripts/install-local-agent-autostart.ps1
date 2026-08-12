param([string]$TaskName = 'ANCV Local Agent')
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$localRoot = Join-Path $env:LOCALAPPDATA 'ANCV\local-agent'
$launcher = Join-Path $localRoot 'start-local-agent.cmd'
$logPath = Join-Path $localRoot 'local-agent.log'
New-Item -ItemType Directory -Force -Path $localRoot | Out-Null
$command = "@echo off`r`ncd /d `"$repo`"`r`nnpm.cmd run local:agent >> `"$logPath`" 2>&1`r`n"
[IO.File]::WriteAllText($launcher, $command, [Text.UTF8Encoding]::new($false))
$action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/d /c `"`"$launcher`"`""
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 2 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Description 'ANCV Local Agent: Firestore jobs, Browser Bridge, local-first media.' -Force | Out-Null
Write-Output "Scheduled task installed: $TaskName"
