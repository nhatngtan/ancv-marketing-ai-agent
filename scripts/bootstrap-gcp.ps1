param(
  [string]$ProjectId = 'ancv-marketing-ai-agent',
  [string]$Region = 'asia-southeast1',
  [string]$ExpectedAccount = 'ancv.marketing@gmail.com'
)
$ErrorActionPreference = 'Continue'
$gcloud = "$env:LOCALAPPDATA\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd"
$account = & $gcloud auth list --filter='status:ACTIVE' --format='value(account)' 2>$null
if ($account -ne $ExpectedAccount) { throw "ACCOUNT MISMATCH: active gcloud account is '$account', expected '$ExpectedAccount'." }

$existing = & $gcloud projects describe $ProjectId --format='value(projectId)' 2>$null
if (-not $existing) {
  # Google Cloud limits the project display name; the full official Vietnamese
  # name remains in Firebase, Firestore settings, and the Web App header.
  & $gcloud projects create $ProjectId --name='ANCV Marketing AI Agent' --set-as-default
  if ($LASTEXITCODE -ne 0) { throw "Failed to create project $ProjectId." }
}
& $gcloud config set project $ProjectId
& $gcloud config set run/region $Region

$coreApis = @(
  'firebase.googleapis.com','firestore.googleapis.com','identitytoolkit.googleapis.com','firebaserules.googleapis.com',
  'firebasehosting.googleapis.com','storage.googleapis.com','logging.googleapis.com','iam.googleapis.com','iamcredentials.googleapis.com'
)
& $gcloud services enable $coreApis --project $ProjectId
if ($LASTEXITCODE -ne 0) { throw 'Failed to enable one or more core APIs.' }

$billingApis = @(
  'run.googleapis.com','cloudbuild.googleapis.com','artifactregistry.googleapis.com','workflows.googleapis.com',
  'workflowexecutions.googleapis.com','cloudtasks.googleapis.com','cloudscheduler.googleapis.com','secretmanager.googleapis.com'
)
& $gcloud services enable $billingApis --project $ProjectId
if ($LASTEXITCODE -ne 0) { Write-Warning 'BILLING_REQUIRED: paid Google Cloud APIs remain disabled; continuing core/service-account setup.' }

$serviceAccounts = @('ancv-cloud-run','ancv-workflows','ancv-automation')
foreach ($name in $serviceAccounts) {
  $email = "$name@$ProjectId.iam.gserviceaccount.com"
  & $gcloud iam service-accounts describe $email --project $ProjectId 2>$null
  if ($LASTEXITCODE -ne 0) { & $gcloud iam service-accounts create $name --project $ProjectId --display-name="ANCV $name" }
}

$bindings = @(
  @{ Member="serviceAccount:ancv-cloud-run@$ProjectId.iam.gserviceaccount.com"; Role='roles/datastore.user' },
  @{ Member="serviceAccount:ancv-cloud-run@$ProjectId.iam.gserviceaccount.com"; Role='roles/storage.objectAdmin' },
  @{ Member="serviceAccount:ancv-cloud-run@$ProjectId.iam.gserviceaccount.com"; Role='roles/secretmanager.secretAccessor' },
  @{ Member="serviceAccount:ancv-automation@$ProjectId.iam.gserviceaccount.com"; Role='roles/cloudtasks.enqueuer' },
  @{ Member="serviceAccount:ancv-automation@$ProjectId.iam.gserviceaccount.com"; Role='roles/workflows.invoker' }
)
foreach ($binding in $bindings) {
  & $gcloud projects add-iam-policy-binding $ProjectId "--member=$($binding.Member)" "--role=$($binding.Role)" --quiet | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Failed IAM binding $($binding.Role) for $($binding.Member)." }
}
Write-Output "BOOTSTRAP_OK project=$ProjectId region=$Region account=$account"
