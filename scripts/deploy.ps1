param([string]$ProjectId, [string]$Region = 'asia-southeast1', [string]$ExpectedAccount = 'nhat.ngtan@gmail.com')
$ErrorActionPreference = 'Continue'
if (-not $ProjectId) { throw 'ProjectId is required.' }
$gcloud = "$env:LOCALAPPDATA\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd"
$account = & $gcloud auth list --filter='status:ACTIVE' --format='value(account)' 2>$null
$firebaseAccount = (firebase.cmd login:list | Select-String 'Logged in as' | ForEach-Object { ($_ -split ' ')[-1] })
if ($account -ne $ExpectedAccount -or $firebaseAccount -ne $ExpectedAccount) { throw 'ACCOUNT MISMATCH: deploy blocked.' }

npm.cmd run verify
if ($LASTEXITCODE -ne 0) { throw 'Local verification failed; deployment stopped.' }
& $gcloud run deploy ancv-marketing-backend --source . --project $ProjectId --region $Region --service-account="ancv-cloud-run@$ProjectId.iam.gserviceaccount.com" --allow-unauthenticated --set-env-vars="NODE_ENV=production" --quiet
if ($LASTEXITCODE -ne 0) { throw 'Cloud Run deployment failed.' }
$backendUrl = & $gcloud run services describe ancv-marketing-backend --project $ProjectId --region $Region --format='value(status.url)'
& $gcloud run services update ancv-marketing-backend --project=$ProjectId --region=$Region --env-vars-file=infra/cloud-run.env.yaml --quiet
if ($LASTEXITCODE -ne 0) { throw 'Cloud Run environment update failed.' }
$openAIVersion = & $gcloud secrets versions list openai-api-key --project=$ProjectId --filter='state:ENABLED' --limit=1 --format='value(name)' 2>$null
if ($openAIVersion) {
  & $gcloud run services update ancv-marketing-backend --project=$ProjectId --region=$Region --update-secrets='OPENAI_API_KEY=openai-api-key:latest' --quiet
  if ($LASTEXITCODE -ne 0) { throw 'OpenAI Secret Manager binding failed.' }
} else {
  Write-Warning 'openai-api-key has no enabled version; OpenAI remains configuration_required.'
}
$wordpressUserVersion = & $gcloud secrets versions list wordpress-username --project=$ProjectId --filter='state:ENABLED' --limit=1 --format='value(name)' 2>$null
$wordpressPasswordVersion = & $gcloud secrets versions list wordpress-application-password --project=$ProjectId --filter='state:ENABLED' --limit=1 --format='value(name)' 2>$null
if ($wordpressUserVersion -and $wordpressPasswordVersion) {
  & $gcloud run services update ancv-marketing-backend --project=$ProjectId --region=$Region --update-secrets='WORDPRESS_USERNAME=wordpress-username:latest,WORDPRESS_APPLICATION_PASSWORD=wordpress-application-password:latest' --quiet
  if ($LASTEXITCODE -ne 0) { throw 'WordPress Secret Manager binding failed.' }
} else {
  Write-Warning 'WordPress credential secrets have no enabled versions; Website remains semi_automatic.'
}
& $gcloud run services add-iam-policy-binding ancv-marketing-backend --project=$ProjectId --region=$Region --member="serviceAccount:ancv-workflows@$ProjectId.iam.gserviceaccount.com" --role='roles/run.invoker' --quiet | Out-Null
& $gcloud run services add-iam-policy-binding ancv-marketing-backend --project=$ProjectId --region=$Region --member="serviceAccount:ancv-automation@$ProjectId.iam.gserviceaccount.com" --role='roles/run.invoker' --quiet | Out-Null
& $gcloud workflows deploy ancv-health-check --source=infra/workflows/health-check.yaml --location=$Region --service-account="ancv-workflows@$ProjectId.iam.gserviceaccount.com" --project=$ProjectId
& $gcloud workflows deploy ancv-publish-content --source=infra/workflows/publish-content.yaml --location=$Region --service-account="ancv-workflows@$ProjectId.iam.gserviceaccount.com" --project=$ProjectId
if ($LASTEXITCODE -ne 0) { throw 'Workflow deployment failed.' }
& $gcloud tasks queues describe ancv-jobs --location=$Region --project=$ProjectId 2>$null
if ($LASTEXITCODE -ne 0) { & $gcloud tasks queues create ancv-jobs --location=$Region --project=$ProjectId --max-attempts=3 --max-concurrent-dispatches=10 --max-dispatches-per-second=5 }
& $gcloud scheduler jobs describe ancv-daily-analytics --location=$Region --project=$ProjectId 2>$null
if ($LASTEXITCODE -ne 0) {
  & $gcloud scheduler jobs create http ancv-daily-analytics --location=$Region --project=$ProjectId --schedule='15 2 * * *' --time-zone='Asia/Ho_Chi_Minh' --uri="$backendUrl/v1/scheduler/analytics/daily" --http-method=POST --oidc-service-account-email="ancv-automation@$ProjectId.iam.gserviceaccount.com" --oidc-token-audience=$backendUrl --max-retry-attempts=2 --attempt-deadline=60s
}
firebase.cmd use $ProjectId
firebase.cmd deploy --config firebase.json --only auth,firestore:rules,firestore:indexes,storage,hosting --project $ProjectId
if ($LASTEXITCODE -ne 0) { throw 'Firebase deployment failed.' }
Write-Output "DEPLOY_OK backend=$backendUrl"
