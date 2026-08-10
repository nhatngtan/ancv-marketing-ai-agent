# Deployment

## Trạng thái môi trường ANCV

- Project ID / Firebase Project ID: `ancv-marketing-ai-agent`
- Project number: `645264934987`
- Region Firestore: `asia-southeast1`
- Web App: `https://ancv-marketing-ai-agent.web.app`
- Development / Operating Account: `nhat.ngtan@gmail.com`
- Future Corporate Admin: `ancv.marketing@gmail.com` (giữ nguyên quyền hiện tại)
- Project Owners: `ancv.marketing@gmail.com` được giữ lại theo xác nhận của người dùng; `nhat.ngtan@gmail.com` là đồng Owner.
- Operational administrator: `nhat.ngtan@gmail.com` dùng cho gcloud, ADC, Firebase, GitHub và Git; đồng thời có các role quản trị theo phạm vi dịch vụ.
- Firestore: đã tạo, production rules và indexes đã deploy, delete protection đã bật.
- Firebase Authentication: Google provider đã bật; user quản trị chính đã seed role `admin`.
- Firebase Storage: bucket `ancv-marketing-ai-agent.firebasestorage.app` đã tạo tại `ASIA-SOUTHEAST1`; production rules đã deploy.
- Cloud Run: `ancv-marketing-backend` đã deploy tại `asia-southeast1`.
- Workflows: `ancv-health-check` và `ancv-publish-content` đang ACTIVE.
- Cloud Tasks: queue `ancv-jobs` đang RUNNING, tối đa 3 lần thử.
- Cloud Scheduler: `ancv-daily-analytics` đang ENABLED, OIDC end-to-end đã trả HTTP 200.
- Billing: đã liên kết Billing account của `nhat.ngtan@gmail.com`.

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

Sau deploy, xác minh IAM: giữ nguyên hai Owner đã được phê duyệt; Cloud Run dùng `ancv-cloud-run`; Workflows dùng `ancv-workflows`; Scheduler/Tasks dùng `ancv-automation`. Xem checklist chuyển giao tại [docs/HANDOVER.md](docs/HANDOVER.md).

## Cấu hình Giai đoạn 2A

- Secret `openai-api-key` đã có version hợp lệ và được mount thành `OPENAI_API_KEY` trên Cloud Run; runtime access thuộc `ancv-cloud-run`.
- Text model: `OPENAI_TEXT_MODEL` (mặc định cấu hình `gpt-5.6-terra`).
- Image model: `OPENAI_IMAGE_MODEL` (mặc định `gpt-image-2`).
- GA4: `GA4_PROPERTY_ID`; cấp Viewer cho `ancv-cloud-run@ancv-marketing-ai-agent.iam.gserviceaccount.com` trên đúng property trước khi test `runReport`.
- Search Console: `SEARCH_CONSOLE_SITE_URL`; thêm đúng Service Account vào property trước khi test `searchAnalytics.query`.
- Website: `WORDPRESS_BASE_URL=https://anninhcanhve.com`; secret containers `wordpress-username` và `wordpress-application-password`. Deploy script chỉ mount khi cả hai có version enabled.

### Thêm WordPress credential an toàn

Tạo Application Password trên user kỹ thuật WordPress có quyền tối thiểu. Thêm username/password thành secret version bằng Secret Manager, không ghi vào `.env` hoặc command history chia sẻ. Sau đó deploy lại; xác minh `/wp/v2/users/me?context=edit`, tạo bài ở trạng thái `draft`, upload media nhỏ và xóa/revoke dữ liệu test theo quy trình CMS.

Không gắn ADC hoặc refresh token cá nhân vào Cloud Run. Việc thêm secret version và cấu hình property phải được thực hiện qua Secret Manager/Cloud Run environment, không commit `.env`.
