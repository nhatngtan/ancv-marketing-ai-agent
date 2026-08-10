# Deployment

## Trạng thái môi trường ANCV

- Project ID / Firebase Project ID: `ancv-marketing-ai-agent`
- Project number: `645264934987`
- Region Firestore: `asia-southeast1`
- Web App: `https://ancv-marketing-ai-agent.web.app`
- Administrator target: `nhat.ngtan@gmail.com`
- Transitional Owner: `ancv.marketing@gmail.com` remains until the Google Owner invitation is accepted.
- Firestore: đã tạo, production rules và indexes đã deploy, delete protection đã bật.
- Firebase Authentication: Google provider đã bật; user quản trị chính đã seed role `admin`.
- Firebase Storage: chưa tạo bucket vì project chưa liên kết Billing.
- Cloud Run, Workflows, Cloud Tasks, Scheduler, Secret Manager: source/manifest/IAM đã chuẩn bị; deployment chờ Billing.

Không đánh dấu các dịch vụ chờ Billing là đã deploy. Sau khi liên kết Billing, chạy lại bootstrap rồi deploy và health test theo hướng dẫn bên dưới.

## Identity gate

Mọi cloud mutation phải qua `scripts/identity-preflight.ps1`. Giá trị yêu cầu:

- Google active account: `nhat.ngtan@gmail.com`
- Firebase active account: `nhat.ngtan@gmail.com`
- Git repository email: `nhat.ngtan@gmail.com`
- Project riêng ANCV; không tái sử dụng ADC, OAuth client hay service-account JSON cũ.

GitHub là gate độc lập: không tạo repository nếu `gh auth status` không xác nhận account/organization chính thức của ANCV.

## GCP/Firebase

```powershell
gcloud.cmd config configurations create ancv --activate
gcloud.cmd auth login nhat.ngtan@gmail.com
firebase.cmd login:add
./scripts/identity-preflight.ps1
./scripts/bootstrap-gcp.ps1 -ProjectId ancv-marketing-ai-agent
firebase.cmd projects:addfirebase ancv-marketing-ai-agent
firebase.cmd firestore:databases:create --project ancv-marketing-ai-agent --location asia-southeast1
```

Nếu project ID không còn trống, dùng hậu tố ngắn và truyền ID thực tế cho tất cả script. Billing là điều kiện cho Cloud Run, Cloud Build, Workflows, Tasks và Scheduler; script không tự chọn billing account khi chưa được chủ tài khoản xác nhận.

Firebase Authentication Google provider phải được enable trong project ANCV. Authorized domain chỉ gồm Hosting domain và domain production đã xác minh. Tạo Web App Firebase riêng, đưa public web config vào build-time variables; không coi chúng là server secret.

## Deploy và kiểm tra

```powershell
./scripts/deploy.ps1 -ProjectId ancv-marketing-ai-agent
gcloud.cmd workflows run ancv-health-check --location asia-southeast1 --data '{"baseUrl":"<cloud-run-url>"}'
./scripts/test-health.ps1 -BaseUrl <cloud-run-url> -IdentityToken (gcloud.cmd auth print-identity-token)
```

Sau deploy, xác minh IAM: administrator ANCV có quyền quản trị project; Cloud Run dùng `ancv-cloud-run`; Workflows dùng `ancv-workflows`; Scheduler/Tasks dùng `ancv-automation`.
