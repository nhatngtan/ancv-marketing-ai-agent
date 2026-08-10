param(
  [string]$ProjectId = 'ancv-marketing-ai-agent',
  [string]$Region = 'asia-southeast1',
  [string]$ExpectedAccount = 'ancv.marketing@gmail.com'
)
$ErrorActionPreference = 'Stop'
$gcloud = "$env:LOCALAPPDATA\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd"
$account = & $gcloud config get-value account 2>$null
if ($account -ne $ExpectedAccount) { throw "ACCOUNT MISMATCH: active gcloud account is '$account', expected '$ExpectedAccount'." }

$existing = & $gcloud projects describe $ProjectId --format='value(projectId)' 2>$null
if (-not $existing) {
  & $gcloud projects create $ProjectId --name='QUẢN TRỊ MARKETING AI AGENT - ANCV' --set-as-default
}
& $gcloud config set project $ProjectId
& $gcloud config set run/region $Region

$apis = @(
  'firebase.googleapis.com','firestore.googleapis.com','identitytoolkit.googleapis.com','storage.googleapis.com',
  'run.googleapis.com','cloudbuild.googleapis.com','artifactregistry.googleapis.com','workflows.googleapis.com',
  'workflowexecutions.googleapis.com','cloudtasks.googleapis.com','cloudscheduler.googleapis.com',
  'secretmanager.googleapis.com','logging.googleapis.com','iam.googleapis.com','iamcredentials.googleapis.com'
)
& $gcloud services enable $apis --project $ProjectId

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
foreach ($binding in $bindings) { & $gcloud projects add-iam-policy-binding $ProjectId --member=$binding.Member --role=$binding.Role --quiet | Out-Null }
Write-Output "BOOTSTRAP_OK project=$ProjectId region=$Region account=$account"

