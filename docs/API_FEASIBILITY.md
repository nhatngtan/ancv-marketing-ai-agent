# API Feasibility Test

Cập nhật: 2026-08-10. Chỉ cột nào có request thực tế mới được ghi PASS. Enable API, đọc tài liệu hoặc phát hiện endpoint công khai không đồng nghĩa publishing/analytics production đã PASS.

| Platform | Auth | Publish | Analytics | Review/Audit | Mode | Ghi chú |
| --- | --- | --- | --- | --- | --- | --- |
| YouTube | Chưa test OAuth | Chưa test upload | Chưa test Data/Analytics API | Chưa test audit thực tế | Thủ công | Cần channel role, scope, upload private và refresh-token test |
| Facebook | Chưa test Page token | Chưa test Page post/video | Chưa test insights | Chưa test App Review/Business Verification | Thủ công | Không suy ra quyền account từ tài liệu |
| TikTok | Chưa test OAuth | Chưa test Direct Post/upload | Chưa test analytics | Chưa test audit | Thủ công | Cần app ANCV và test scope thực cấp |
| LinkedIn | Chưa test OAuth | Chưa test Posts API | Chưa test analytics | Chưa test Community Management review | Thủ công | Cần organization role và app program access |
| Zalo | Chưa test OA token | Chưa test OA API | Chưa test OA analytics | Chưa test OA/app conditions | Thủ công | Cần app/OA đúng owner và token lifecycle |
| Website | Homepage + REST discovery PASS; CMS auth chưa test | WordPress REST root PASS; create/update/media chưa test | Chưa test | N/A | Bán tự động | `https://anninhcanhve.com` HTTP 200, WordPress 6.8, `/wp-json/` PASS; cần chủ dự án xác nhận target và cấp CMS credential |
| GA4 | Runtime Service Account token + `accountSummaries.list` PASS | N/A | Chưa PASS `runReport` | N/A | Thủ công | Request bằng `ancv-cloud-run`; 0 property khả dụng, chưa có `GA4_PROPERTY_ID` |
| Search Console | Runtime Service Account token + `sites.list` PASS | N/A | Chưa PASS `searchAnalytics.query` | N/A | Thủ công | Request bằng `ancv-cloud-run`; 0 property khả dụng, chưa có `SEARCH_CONSOLE_SITE_URL` |

## Evidence đã lưu

Kết quả được ghi vào Firestore `connectorTests`; snapshot mới nhất được merge vào `connectors/{platform}`.

- GA4: API enabled; OAuth scope `analytics.readonly`; `accountSummaries.list` trả HTTP thành công nhưng `accessiblePropertyCount = 0`.
- Search Console: API enabled; OAuth scope `webmasters.readonly`; `sites.list` trả HTTP thành công nhưng `accessibleSiteCount = 0`.
- Website: homepage HTTP 200; generator `WordPress 6.8`; REST root trả JSON thành công. Authentication và write request không được thử khi chưa có credential.
- OpenAI: Secret Manager container `openai-api-key` đã tạo, chưa có secret version; không thực hiện API request giả và health giữ `configuration_required`.

## Nguồn chính thức đã đối chiếu

- OpenAI: [Responses API/model guidance](https://developers.openai.com/api/docs/guides/latest-model), [GPT Image 2](https://developers.openai.com/api/docs/models/gpt-image-2).
- GA4: [Data API quickstart](https://developers.google.com/analytics/devguides/reporting/data/v1/quickstart), [accountSummaries.list](https://developers.google.com/analytics/devguides/config/admin/v1/rest/v1alpha/accountSummaries/list), [Data API quotas](https://developers.google.com/analytics/devguides/reporting/data/v1/quotas).
- Search Console: [OAuth authorization](https://developers.google.com/webmaster-tools/v1/how-tos/authorizing), [sites.list](https://developers.google.com/webmaster-tools/v1/sites/list), [Search Analytics query](https://developers.google.com/webmaster-tools/v1/searchanalytics/query), [usage limits](https://developers.google.com/webmaster-tools/limits).
- YouTube: [OAuth](https://developers.google.com/youtube/v3/guides/authentication), [Videos API](https://developers.google.com/youtube/v3/docs/videos), [quota/audit](https://developers.google.com/youtube/v3/guides/quota_and_compliance_audits).
- Facebook: [Pages API](https://developers.facebook.com/docs/pages-api/), [App Review](https://developers.facebook.com/docs/app-review/).
- TikTok: [Content Posting API](https://developers.tiktok.com/products/content-posting-api), [sharing guidelines](https://developers.tiktok.com/doc/content-sharing-guidelines/).
- LinkedIn: [Posts API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api), [Community Management review](https://learn.microsoft.com/en-us/linkedin/marketing/community-management-app-review).
- Zalo: [Zalo for Developers](https://developers.zalo.me/docs/).

## Điều kiện chuyển `available`

Phải có đúng owner/resource, scope thực cấp, request nghiệp vụ production-like thành công, refresh-token lifecycle nếu dùng user OAuth, quota phù hợp và không còn review blocker. PASS một phần chỉ được `partially_available`; Admin vẫn có thể override về mode thấp hơn.
