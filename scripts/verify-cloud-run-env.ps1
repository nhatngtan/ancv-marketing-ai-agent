param(
  [Parameter(Mandatory = $true)][string]$ProjectId,
  [string]$Region = 'asia-southeast1',
  [string]$ServiceName = 'ancv-marketing-backend'
)

$ErrorActionPreference = 'Stop'
$gcloud = "$env:LOCALAPPDATA\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd"
$canonicalPath = (Resolve-Path (Join-Path $PSScriptRoot '..\infra\cloud-run.env.yaml')).Path
$canonical = @{}
foreach ($line in Get-Content -LiteralPath $canonicalPath) {
  if ($line -match '^\s*([A-Z][A-Z0-9_]+):\s*(.*?)\s*$') {
    $canonical[$Matches[1]] = $Matches[2].Trim("'", '"')
  }
}
if ($canonical.Count -eq 0) { throw 'Canonical Cloud Run environment is empty.' }

$serviceJson = & $gcloud run services describe $ServiceName --project=$ProjectId --region=$Region --format=json
if ($LASTEXITCODE -ne 0) { throw 'Cannot read deployed Cloud Run service.' }
$service = ($serviceJson | Out-String | ConvertFrom-Json)
$plainEnvironment = @{}
foreach ($entry in @($service.spec.template.spec.containers[0].env)) {
  if (-not $entry.valueFrom) { $plainEnvironment[[string]$entry.name] = [string]$entry.value }
}

$missing = @($canonical.Keys | Where-Object { -not $plainEnvironment.ContainsKey($_) } | Sort-Object)
$mismatched = @($canonical.Keys | Where-Object { $plainEnvironment.ContainsKey($_) -and $plainEnvironment[$_] -ne $canonical[$_] } | Sort-Object)
if ($missing.Count -gt 0) { throw "Cloud Run required environment missing: $($missing -join ', ')" }
if ($mismatched.Count -gt 0) { throw "Cloud Run canonical environment mismatch: $($mismatched -join ', ')" }

[pscustomobject]@{
  status = 'PASS'
  service = $ServiceName
  revision = $service.status.latestReadyRevisionName
  verifiedEnvironmentNames = @($canonical.Keys | Sort-Object)
} | ConvertTo-Json -Compress
