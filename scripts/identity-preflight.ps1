param([string]$ExpectedAccount = 'nhat.ngtan@gmail.com')
$ErrorActionPreference = 'Continue'
$gcloud = "$env:LOCALAPPDATA\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd"
$gcloudAccount = if (Test-Path $gcloud) { (& $gcloud auth list --filter='status:ACTIVE' --format='value(account)' 2>$null) } else { 'MISSING' }
$gcloudProject = if (Test-Path $gcloud) { (& $gcloud config get-value project 2>$null) } else { 'MISSING' }
$firebaseAccount = (firebase.cmd login:list 2>$null | Select-String 'Logged in as' | ForEach-Object { ($_ -split ' ')[-1] })
$ghStatus = gh auth status 2>&1 | Out-String
$ghAccount = if ($ghStatus -match 'account\s+([^\s]+)') { $Matches[1] } else { 'UNAUTHENTICATED' }
$gitEmail = git config --local user.email 2>$null
$adc = Join-Path $env:APPDATA 'gcloud\application_default_credentials.json'
$result = [ordered]@{
  expectedAdministrativeAccount = $ExpectedAccount
  googleActiveAccount = $gcloudAccount
  googleCloudProject = $gcloudProject
  firebaseActiveAccount = if ($firebaseAccount) { $firebaseAccount } else { 'UNAUTHENTICATED' }
  firebaseProject = if (Test-Path '.firebaserc') { (Get-Content '.firebaserc' -Raw | ConvertFrom-Json).projects.default } else { 'UNSET' }
  githubAuthenticatedAccount = $ghAccount
  gitRepositoryEmail = $gitEmail
  applicationDefaultCredential = if (Test-Path $adc) { 'PRESENT_REQUIRES_VERIFICATION' } else { 'NOT_PRESENT' }
}
$result | ConvertTo-Json
if ($gcloudAccount -ne $ExpectedAccount -or $firebaseAccount -ne $ExpectedAccount) {
  Write-Error 'ACCOUNT MISMATCH: cloud mutation is blocked.'
}
