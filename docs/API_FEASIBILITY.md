# API Feasibility Test

Cập nhật: 2026-08-11. Chỉ đánh dấu PASS khi request thật đã thành công. Việc bật API, đọc tài liệu hoặc phát hiện endpoint công khai không đồng nghĩa nghiệp vụ production đã PASS.

| Platform | Auth | Publish | Analytics | Review/Audit | Mode | Ghi chú |
| --- | --- | --- | --- | --- | --- | --- |
| OpenAI | Secret Manager + Cloud Run production Service Account PASS | Responses API PASS; Image API PASS | Usage evidence PASS | N/A | Tự động | Request thật từ Cloud Run, không lưu ảnh test |
| YouTube | Chưa test OAuth | Chưa test upload | Chưa test Data/Analytics API | Chưa test audit thực tế | Thủ công | Cần channel role, scope, upload private và refresh-token test |
| Facebook | Chưa test Page token | Chưa test Page post/video | Chưa test insights | Chưa test App Review/Business Verification | Thủ công | Không suy ra quyền account từ tài liệu |
| TikTok | Chưa test OAuth | Chưa test Direct Post/upload | Chưa test analytics | Chưa test audit | Thủ công | Cần app ANCV và test scope thực cấp |
| LinkedIn | Chưa test OAuth | Chưa test Posts API | Chưa test analytics | Chưa test Community Management review | Thủ công | Cần organization role và app program access |
| Zalo | Chưa test OA token | Chưa test OA API | Chưa test OA analytics | Chưa test OA/app conditions | Thủ công | Cần app/OA đúng owner và token lifecycle |
| Website | REST discovery PASS; authenticated `/users/me` chưa test | NOT TESTED | Chưa test | N/A | Bán tự động | Website đang xây dựng; connectivity check chỉ dùng GET read-only |
| GA4 | Runtime Service Account list PASS | N/A | Chưa PASS `runReport` | N/A | Thủ công | Service Account thấy 0 property; tài khoản development cũng không thấy property ANCV |
| Search Console | Runtime Service Account list PASS | N/A | Chưa PASS `searchAnalytics.query` | N/A | Thủ công | Service Account thấy 0 property; tài khoản development không có `anninhcanhve.com` |

## Evidence OpenAI

- Cloud Run revision `ancv-marketing-backend-00012-8jk` chạy bằng `ancv-cloud-run@ancv-marketing-ai-agent.iam.gserviceaccount.com` và mount `OPENAI_API_KEY` từ `openai-api-key:latest`.
- Responses API: model `gpt-5.6-terra`, output kiểm tra `ANCV_OK`, request sau correction deploy `req_9e28e3c3a4b7443d948e4c7fc15fa344`, 21 input + 7 output = 28 tokens.
- Image API: model `gpt-image-2`, một ảnh PNG 1024x1024 quality low, request `req_7225f13e257c47b4b440935f9fdff66e`, 772.296 bytes, 21 input + 196 output = 217 tokens. Ảnh không được lưu.
- Negative tests production: body không hợp lệ trả 400; thiếu automation identity trả 401; cả hai không làm mất snapshot PASS.
- Structured Cloud Logging có event `openai_usage`, request ID, model, token tổng và số byte; không ghi API key hoặc prompt.
- Firestore `systemSettings/openai` giữ snapshot live; `/health` và `/v1/ai/health` đọc snapshot này.

## Evidence GA4, Search Console và Website

- GA4: request `accountSummaries.list` thật bằng runtime Service Account PASS, `accessiblePropertyCount = 0`. Kiểm tra read-only trên UI với `nhat.ngtan@gmail.com` chỉ thấy các account cũ (HocVeAI, HocVeAI-App, Hoho, Nhat Nguyen, Tho Tai Gioi, TruyenDai.VN), không thấy ANCV/An Ninh Cảnh Vệ. Không sử dụng các property này.
- Search Console: request `sites.list` thật bằng runtime Service Account PASS, `accessibleSiteCount = 0`. UI xác nhận account `nhat.ngtan@gmail.com` chỉ có `sc-domain:hocveai.com` và `sc-domain:truyendai.vn`, không có `anninhcanhve.com`.
- Website: `GET https://anninhcanhve.com/wp-json/` trả HTTP 200, namespace `wp/v2` và Application Password discovery PASS. Anonymous `GET /wp-json/wp/v2/users/me` trả 401 đúng dự kiến. Không gửi request POST/PUT/PATCH/DELETE.
- Secret `wordpress-username` có version enabled với user kỹ thuật `editor01`; `wordpress-application-password` chưa có version. Authenticated GET `/users/me` chưa thể chạy và production chưa mount bộ credential chưa đầy đủ.
- Kết quả được lưu trong Firestore `connectorTests`; snapshot mới nhất được merge vào `connectors/{platform}`.

## Authentication production đề xuất

- GA4 và Search Console: ưu tiên runtime Service Account hiện có, dùng Cloud Run ADC và cấp quyền trực tiếp trên đúng property; không tạo JSON key. User OAuth chỉ là fallback nếu property thực tế không chấp nhận mô hình này; khi đó dùng OAuth client riêng và refresh token trong Secret Manager.
- WordPress: user kỹ thuật riêng với quyền tối thiểu cần thiết + Application Password qua HTTPS; username/password lưu trong Secret Manager và có thể rotate không sửa source.

## Nguồn chính thức

- OpenAI: [Responses API/model guidance](https://developers.openai.com/api/docs/guides/latest-model), [GPT Image 2](https://developers.openai.com/api/docs/models/gpt-image-2).
- GA4: [Data API quickstart](https://developers.google.com/analytics/devguides/reporting/data/v1/quickstart), [Admin API quickstart](https://developers.google.com/analytics/devguides/config/admin/v1/quickstart), [Data API quotas](https://developers.google.com/analytics/devguides/reporting/data/v1/quotas).
- Search Console: [OAuth authorization](https://developers.google.com/webmaster-tools/v1/how-tos/authorizing), [property users and permissions](https://support.google.com/webmasters/answer/7687615), [Search Analytics query](https://developers.google.com/webmaster-tools/v1/searchanalytics/query), [usage limits](https://developers.google.com/webmaster-tools/limits).
- WordPress: [REST authentication](https://developer.wordpress.org/rest-api/using-the-rest-api/authentication/), [Application Passwords](https://developer.wordpress.org/rest-api/reference/application-passwords/).
- YouTube: [OAuth](https://developers.google.com/youtube/v3/guides/authentication), [Videos API](https://developers.google.com/youtube/v3/docs/videos), [quota/audit](https://developers.google.com/youtube/v3/guides/quota_and_compliance_audits).
- Facebook: [Pages API](https://developers.facebook.com/docs/pages-api/), [App Review](https://developers.facebook.com/docs/app-review/).
- TikTok: [Content Posting API](https://developers.tiktok.com/products/content-posting-api), [sharing guidelines](https://developers.tiktok.com/doc/content-sharing-guidelines/).
- LinkedIn: [Posts API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api), [Community Management review](https://learn.microsoft.com/en-us/linkedin/marketing/community-management-app-review).
- Zalo: [Zalo for Developers](https://developers.zalo.me/docs/).

## Điều kiện chuyển `available`

Phải có đúng owner/resource, scope thực cấp, request nghiệp vụ production-like thành công, refresh-token lifecycle nếu dùng user OAuth, quota phù hợp và không còn review blocker. PASS một phần chỉ được `partially_available`; Admin vẫn có thể override về mode thấp hơn.

## Recheck Phase 2C — 2026-08-11

- WordPress connectivity-only: REST root PASS; `wordpress-username` enabled, `wordpress-application-password` chưa có version. Authenticated GET `/users/me` NOT TESTED; write/media/publishing đều NOT TESTED. Giữ `partially_available / semi_automatic` và Manual Fallback.
- GA4: `accountSummaries.list` bằng production Service Account PASS, `accessiblePropertyCount = 0`; `runReport` chưa được phép chạy và connector giữ manual/no-data.
- Search Console: `sites.list` bằng production Service Account PASS, `accessibleSiteCount = 0`; `searchAnalytics.query` chưa được phép chạy và connector giữ manual/no-data.
- Website HTML công khai không được dùng làm bằng chứng cho quyền GA4 Data API hoặc Search Console API.
