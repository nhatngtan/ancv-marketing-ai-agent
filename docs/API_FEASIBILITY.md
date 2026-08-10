# API Feasibility Test

Cập nhật tài liệu: 2026-08-10. Đây là **desktop research từ tài liệu chính thức**, chưa phải production request test. Do chưa có OAuth/app/property credential ANCV, mọi connector giữ `not_tested`; không có connector nào PASS.

| Platform | Auth | Publish | Analytics | Review/Audit | Mode | Ghi chú |
| --- | --- | --- | --- | --- | --- | --- |
| YouTube | Chưa test OAuth | Chưa test upload | Chưa test Data/Analytics API | Upload từ project chưa audit có hạn chế public | Thủ công | Cần channel access, scope thực cấp, upload private test và refresh-token test |
| Facebook | Chưa test Page token | Chưa test Page post/video | Chưa test insights | Phải xác minh quyền/App Review thực tế trong app ANCV | Thủ công | Tài liệu Meta không đủ để kết luận quyền account hiện tại |
| TikTok | Chưa test OAuth | Chưa test Direct Post/upload | Chưa test analytics | Direct Post chưa audit bị giới hạn private; audit riêng | Thủ công | Cần test `video.upload`/`video.publish`, creator cap và domain ownership |
| LinkedIn | Chưa test OAuth | Chưa test Posts API | Chưa test org/page analytics | Community Management access request và review | Thủ công | Cần xác minh role organization và scopes thực cấp |
| Zalo | Chưa test OA token | Chưa test OA API | Chưa test OA analytics | Chưa xác minh điều kiện OA/app | Thủ công | Portal chính thức được xác định; endpoint/quota phải test trong app ANCV |
| Website | Chưa biết CMS | Chưa test | N/A | N/A | Thủ công | Cần URL/CMS/API/auth từ website ANCV |
| GA4 | Chưa test property access | N/A | Chưa test `runReport` | Không đánh đồng enable API với property access | Thủ công | Cần Property ID và request dimensions/metrics/date range |
| Search Console | Chưa test property access | N/A | Chưa test Search Analytics | Cần quyền đúng property | Thủ công | Cần query clicks/impressions/CTR/position và range thực tế |

## Nguồn chính thức đã kiểm tra

- YouTube: [OAuth 2.0](https://developers.google.com/youtube/v3/guides/authentication), [Videos API và audit restriction](https://developers.google.com/youtube/v3/docs/videos), [quota/compliance](https://developers.google.com/youtube/v3/guides/quota_and_compliance_audits).
- Facebook: [Meta Pages API](https://developers.facebook.com/docs/pages-api/) và [App Review](https://developers.facebook.com/docs/app-review/). Các trang yêu cầu session/portal có thể thay đổi; production test vẫn bắt buộc.
- TikTok: [Content Posting API](https://developers.tiktok.com/products/content-posting-api), [guidelines/audit limits](https://developers.tiktok.com/doc/content-sharing-guidelines/), [upload reference](https://developers.tiktok.com/doc/content-posting-api-reference-upload-video/).
- LinkedIn: [Posts API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api), [Community Management App Review](https://learn.microsoft.com/en-us/linkedin/marketing/community-management-app-review).
- Zalo: [Zalo for Developers](https://developers.zalo.me/docs/). Nội dung OA chi tiết phải xác minh sau khi tạo app đúng owner.
- GA4: [Data API quickstart](https://developers.google.com/analytics/devguides/reporting/data/v1/quickstart), [quota](https://developers.google.com/analytics/devguides/reporting/data/v1/quotas), [schema](https://developers.google.com/analytics/devguides/reporting/data/v1/api-schema).
- Search Console: [Search Analytics query](https://developers.google.com/webmaster-tools/v1/searchanalytics/query), [usage limits](https://developers.google.com/webmaster-tools/limits), [data limits](https://developers.google.com/webmaster-tools/v1/how-tos/all-your-data).

## Tiêu chí chuyển `available`

OAuth đúng account/resource; scope thực cấp; request nghiệp vụ production-like thành công; refresh token thành công nếu cần; quota và review không còn blocker. Kết quả được ghi vào `connectorTests`, sau đó cập nhật `connectors` bằng admin. Nếu chỉ một phần PASS, trạng thái `partially_available` và mode tối đa `semi_automatic`.

