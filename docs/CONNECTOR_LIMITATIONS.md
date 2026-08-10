# Connector Limitations

| Connector | Giới hạn đã biết từ tài liệu | Chưa xác minh cho ANCV | Safe mode |
| --- | --- | --- | --- |
| YouTube | OAuth user; service account không gắn được YouTube channel; upload/audit và quota theo project | Channel role, scopes, refresh token, quota bucket, public publishing | Manual |
| Facebook | Permission và Page access phụ thuộc app/account/review tại thời điểm chạy | Page admin, app ownership, allowed permissions, publish/insights request | Manual |
| TikTok | Unaudited Direct Post private; caps theo app/creator; upload có rate/pending limits | Audit, creator eligibility, scopes, domain URL ownership | Manual |
| LinkedIn | Versioned API; organization roles; Community Management review | App program access, org role, scopes, API version quota | Manual |
| Zalo | OA/app access và endpoint phụ thuộc portal/policy hiện hành | OA ownership, token refresh, publishing/analytics/quota | Manual |
| Website | CMS chưa biết | API, auth, media upload, category/tag | Manual |
| GA4 | Quota theo property/project; compatibility và sampling/thresholding có thể ảnh hưởng dữ liệu | Property ID/access, metrics, dimensions, range | No data |
| Search Console | Kết quả ưu tiên top rows; row/data limits; property authorization | Property URL/domain, access, row completeness | No data |

Connector error không xóa snapshot cũ. UI hiển thị `Dữ liệu không khả dụng` hoặc timestamp cũ thay vì zero giả.

