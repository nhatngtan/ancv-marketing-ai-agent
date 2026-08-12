# Handover Readiness

Tài liệu này là checklist chuẩn bị bàn giao, không thực hiện chuyển ownership ở giai đoạn hiện tại.

Launch readiness và bằng chứng Final UAT được chốt tại [UAT_PHASE_3.md](UAT_PHASE_3.md). Quy trình vận hành hằng ngày nằm ở mục **START HẰNG NGÀY** trong [README.md](../README.md).

## Hiện tại

- Development / Operating Account: `nhat.ngtan@gmail.com`
- Future Corporate Admin: `ancv.marketing@gmail.com`
- GitHub: `nhatngtan`
- Google Cloud / Firebase Project: `ancv-marketing-ai-agent`
- Project Owners: giữ nguyên cả `nhat.ngtan@gmail.com` và `ancv.marketing@gmail.com`
- Git commit email (repository-local): `nhat.ngtan@gmail.com`

Application không hard-code email cá nhân để quyết định role. Quyền Web App được lấy từ Firebase Authentication và `users/{uid}` trong Firestore. Runtime dùng Service Account riêng; ADC cá nhân chỉ dùng cho công cụ development đã qua identity pre-flight.

## Runtime Service Accounts

- Cloud Run: `ancv-cloud-run@ancv-marketing-ai-agent.iam.gserviceaccount.com`
- Workflows: `ancv-workflows@ancv-marketing-ai-agent.iam.gserviceaccount.com`
- Scheduler / Tasks: `ancv-automation@ancv-marketing-ai-agent.iam.gserviceaccount.com`

## Checklist khi bàn giao sau này

- [ ] Xác nhận Google Cloud IAM và Firebase Admin cho tài khoản Công ty.
- [ ] Xác nhận Billing owner/contact và phương thức thanh toán của Công ty.
- [ ] Transfer GitHub repository hoặc chuyển vào organization; rà lại Actions, deploy key và branch protection.
- [ ] Đổi OpenAI API key trong Secret Manager sang key Công ty; source code không cần sửa.
- [ ] Xác nhận `openai-api-key` thuộc billing/project API của Công ty, rotate version rồi chạy lại Responses + Image smoke test.
- [ ] Kiểm tra owner/admin và khả năng transfer của tất cả Google OAuth clients.
- [ ] Kiểm tra Meta Developer App, Business Verification và Page ownership.
- [ ] Kiểm tra TikTok Developer App, audit và owner/admin.
- [ ] Kiểm tra LinkedIn App, organization admin và Community Management review.
- [ ] Kiểm tra Zalo App/OA owner và token lifecycle.
- [ ] Chọn/tạo GA4 property ANCV, cấp Viewer cho production Service Account, cấu hình numeric property ID và chạy `runReport`.
- [ ] Verify `sc-domain:anninhcanhve.com`, cấp quyền cho production Service Account, cấu hình site URL và chạy `searchAnalytics.query`.
- [x] Tạo WordPress Application Password cho user kỹ thuật `editor01`; thêm version vào Secret Manager và authenticated GET `/users/me` đã PASS.
- [ ] Rà lại role của `editor01`: WordPress REST API đang trả `administrator`, khác với role `Editor` được cung cấp ban đầu; hạ quyền trong WordPress Admin nếu đây không phải chủ ý.
- [ ] Chỉ khi Website sẵn sàng và có phê duyệt scope mới: lập kế hoạch riêng để test draft/media/write; không suy ra quyền publishing từ connectivity PASS.
- [ ] Kiểm tra Website CMS owner, domain/DNS, hosting và khả năng chuyển credential sang Corporate Admin.
- [ ] Kiểm tra Google Flow subscription/session; strict `x1` smoke ngày 2026-08-11 đã PASS nhưng Flow vẫn là experimental và không phải dependency.
- [ ] Tạo lại từng persistent Flow profile trên máy bàn giao; không copy cookie/session từ máy development và không lưu profile vào Cloud/Git.
- [ ] Profile local `account-01` hiện ánh xạ tới tài khoản Flow development đã quan sát là `nhat.nt142@gmail.com`; xác nhận lại subscription/ownership trước bàn giao và thay mapping trong Firestore nếu đổi account.
- [ ] Rotate/revoke credential development chỉ sau khi production credential đã test PASS.
- [ ] Rà `systemSettings/companyProfile`, chỉ giữ dữ kiện Công ty đã được phê duyệt để AI sử dụng.
- [ ] Xác nhận retention/quota cho `aiUsage`, `aiJobs`, `auditLogs` và Cloud Storage media.
- [ ] Kiểm tra model mapping theo operation và spend/rate limit trước khi tăng quy mô sản xuất.
- [ ] Chạy lại toàn bộ API Feasibility Test và lưu evidence mới trong `connectorTests`.

## Quy tắc transfer

Không xóa hoặc downgrade `ancv.marketing@gmail.com` trong giai đoạn development. Không dùng token OAuth, browser session hay ADC của `nhat.ngtan@gmail.com` làm dependency runtime lâu dài. Mọi connector khó chuyển ownership phải được ghi trong `CONNECTOR_LIMITATIONS.md` trước khi enable production.
