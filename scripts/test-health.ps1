param([Parameter(Mandatory=$true)][string]$BaseUrl, [string]$IdentityToken)
$headers = if ($IdentityToken) { @{ Authorization = "Bearer $IdentityToken" } } else { @{} }
$health = Invoke-RestMethod -Uri "$BaseUrl/health" -Headers $headers
$connectors = Invoke-RestMethod -Uri "$BaseUrl/connectors/health" -Headers $headers
if ($health.status -notin @('ok','degraded')) { throw 'Cloud Run health failed.' }
if ($connectors.connectors.Count -ne 8) { throw 'Connector health is incomplete.' }
Write-Output "HEALTH_OK service=$($health.service) connectors=$($connectors.connectors.Count)"

