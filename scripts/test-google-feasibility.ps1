param(
  [string]$ProjectId = 'ancv-marketing-ai-agent',
  [string]$ExpectedAccount = 'nhat.ngtan@gmail.com',
  [string]$RuntimeServiceAccount = 'ancv-cloud-run@ancv-marketing-ai-agent.iam.gserviceaccount.com'
)
$ErrorActionPreference = 'Stop'
$gcloud = "$env:LOCALAPPDATA\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd"
$active = & $gcloud auth list --filter='status:ACTIVE' --format='value(account)'
$project = & $gcloud config list --format='value(core.project)' 2>$null
if ($active -ne $ExpectedAccount -or $project -ne $ProjectId) { throw 'ACCOUNT MISMATCH: Google feasibility test blocked.' }

$scopes = 'https://www.googleapis.com/auth/analytics.readonly,https://www.googleapis.com/auth/webmasters.readonly'
$token = & $gcloud auth print-access-token --impersonate-service-account=$RuntimeServiceAccount --scopes=$scopes
if ($LASTEXITCODE -ne 0 -or -not $token) { throw 'Cannot impersonate ANCV runtime Service Account.' }
$headers = @{ Authorization = "Bearer $token" }

$ga4 = Invoke-RestMethod 'https://analyticsadmin.googleapis.com/v1alpha/accountSummaries?pageSize=200' -Headers $headers
$gsc = Invoke-RestMethod 'https://www.googleapis.com/webmasters/v3/sites' -Headers $headers
$ga4Count = if ($null -eq $ga4.accountSummaries) { 0 } else { @($ga4.accountSummaries | ForEach-Object propertySummaries).Count }
$gscCount = if ($null -eq $gsc.siteEntry) { 0 } else { @($gsc.siteEntry).Count }

[pscustomobject]@{
  testedCredential = $RuntimeServiceAccount
  ga4AccountSummaryRequest = 'passed'
  ga4AccessiblePropertyCount = $ga4Count
  searchConsoleSitesListRequest = 'passed'
  searchConsoleAccessibleSiteCount = $gscCount
  note = 'List request PASS is not Analytics PASS. runReport/query still require a selected property and successful business request.'
} | ConvertTo-Json
