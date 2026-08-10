# Connector Limitations

| Connector | Giới hạn / evidence hiện tại | Chưa xác minh cho ANCV | Safe mode |
| --- | --- | --- | --- |
| YouTube | OAuth user; service account không gắn trực tiếp YouTube channel; upload/audit và quota theo project | Channel role, scopes, refresh token, quota, public publishing | Manual |
| Facebook | Permission và Page access phụ thuộc app/account/review | Page admin, app ownership/transfer, permissions, publish/insights | Manual |
| TikTok | Direct Post cần audit và có caps theo app/creator | Audit, owner transfer, creator eligibility, scopes, domain | Manual |
| LinkedIn | Versioned API, organization roles, Community Management review | App program access, owner/admin transfer, scopes, quota | Manual |
| Zalo | OA/app access và endpoint phụ thuộc portal/policy | OA ownership/transfer, token refresh, publishing/analytics | Manual |
| Website | `anninhcanhve.com` phát hiện WordPress 6.8 và REST root công khai | Xác nhận đây là website production của Công ty; CMS auth, create/update, media, category/tag | Semi-automatic |
| GA4 | Runtime Service Account auth/list request PASS nhưng thấy 0 property | Property ID, cấp property role cho production SA, `runReport`, metrics/dimensions/date range/quota | No data / Manual |
| Search Console | Runtime Service Account auth/list request PASS nhưng thấy 0 property | Property URL/domain, cấp property role cho production SA, query clicks/impressions/CTR/position | No data / Manual |
| OpenAI | Provider và Secret Manager container đã có; chưa có secret version | API key production và live Responses/Image request | Configuration required |

## Ownership và bàn giao

Không tạo developer app production nếu chưa xác minh nền tảng cho phép thêm admin doanh nghiệp hoặc transfer owner. Credential development phải được đánh dấu và có thể rotate bằng Secret Manager/configuration, không sửa business logic. Checklist đầy đủ ở [HANDOVER.md](HANDOVER.md).

Connector error không xóa snapshot cũ. Dashboard hiển thị dữ liệu cập nhật lần cuối hoặc “Dữ liệu không khả dụng”, không thay dữ liệu thiếu bằng số 0 giả.
