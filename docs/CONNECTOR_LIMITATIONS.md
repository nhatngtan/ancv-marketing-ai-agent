# Connector Limitations

| Connector | Giới hạn / evidence hiện tại | Chưa xác minh cho ANCV | Safe mode |
| --- | --- | --- | --- |
| YouTube | OAuth user; service account không gắn trực tiếp YouTube channel; upload/audit và quota theo project | Channel role, scopes, refresh token, quota, public publishing | Manual |
| Facebook | Permission và Page access phụ thuộc app/account/review | Page admin, app ownership/transfer, permissions, publish/insights | Manual |
| TikTok | Direct Post cần audit và có caps theo app/creator | Audit, owner transfer, creator eligibility, scopes, domain | Manual |
| LinkedIn | Versioned API, organization roles, Community Management review | App program access, owner/admin transfer, scopes, quota | Manual |
| Zalo | OA/app access và endpoint phụ thuộc portal/policy | OA ownership/transfer, token refresh, publishing/analytics | Manual |
| Website | WordPress REST root, namespace `wp/v2` và Application Password discovery PASS bằng GET | Application Password, authenticated `/users/me`; write/media/publishing chủ ý NOT TESTED | Semi-automatic |
| GA4 | Runtime Service Account auth/list PASS nhưng thấy 0 property; development UI không có property ANCV | Tạo/chọn property, property ID, cấp Viewer cho production SA, `runReport`, metrics/dimensions/date range/quota | No data / Manual |
| Search Console | Runtime Service Account auth/list PASS nhưng thấy 0 property; development UI không có `anninhcanhve.com` | Verify property, cấp quyền production SA, query clicks/impressions/CTR/position | No data / Manual |
| OpenAI | Responses + Image API request thật PASS từ production Service Account; secret được mount từ Secret Manager | Theo dõi quota/billing và rotate key doanh nghiệp khi bàn giao | Automatic |

GA4/Search Console không dùng các property cá nhân/cũ đang thấy trong account development. Nếu phải dùng user OAuth thay Service Account, OAuth client và refresh token phải thuộc ANCV, lưu Secret Manager, có quy trình chuyển admin và revoke.

WordPress credentials không được commit hoặc đưa vào Cloud Run cho đến khi cả hai secret có version enabled. Application Password phải thuộc `editor01`, có thể revoke độc lập với mật khẩu đăng nhập. Trong khi Website đang xây dựng, connector chỉ được gửi GET; không test bài viết, draft, media, category/tag hoặc publishing.

Connector error không xóa snapshot cũ. Dashboard hiển thị dữ liệu cập nhật lần cuối hoặc “Dữ liệu không khả dụng”, không thay dữ liệu thiếu bằng số 0 giả.

## Ownership và bàn giao

Không tạo developer app production nếu chưa xác minh nền tảng cho phép thêm admin doanh nghiệp hoặc transfer owner. Credential development phải được đánh dấu và rotate bằng Secret Manager/configuration, không sửa business logic. Checklist ở [HANDOVER.md](HANDOVER.md).
