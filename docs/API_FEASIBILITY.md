# API Feasibility Test

Cập nhật: 2026-08-11. Chỉ đánh dấu PASS khi request thật đã thành công. Việc bật API, đọc tài liệu hoặc phát hiện endpoint công khai không đồng nghĩa nghiệp vụ production đã PASS.

| Platform | Auth | Publish | Analytics | Review/Audit | Mode | Ghi chú |
| --- | --- | --- | --- | --- | --- | --- |
| OpenAI | Secret Manager + Cloud Run production Service Account PASS | Responses API PASS; Image API PASS | Usage evidence PASS | N/A | Tự động | Request thật từ Cloud Run, không lưu ảnh test |
| YouTube | OAuth + refresh token PASS; `channels.list(mine=true)` khớp đúng channel | `videos.insert` PRIVATE PASS đúng 01 video; public/unlisted/update/delete/scheduling NOT TESTED | `reports.query` PASS, HTTP 200, 7 dòng | Sensitive scopes chưa verified; compliance audit/public automation chưa xác minh | Bán tự động | Channel `UCy-H7__UvdWcTbUax3RGDcA`; test Video ID `OSbbjviru7A`, private, 1 attempt, không retry |
| Facebook | Chưa có Meta App/Page token; portal yêu cầu đăng nhập | Page post/video NOT TESTED | Page Insights NOT TESTED | App Review/Business Verification chưa bắt đầu | Thủ công | Page ID/quyền quản trị chưa xác minh; URL ứng viên cũ hiện unavailable |
| TikTok | Chưa có Developer App/token; portal yêu cầu đăng nhập | Direct Post/upload NOT TESTED | Display/metrics NOT TESTED | Audit chưa bắt đầu | Thủ công | Chưa xác minh creator account; unaudited Direct Post chỉ private/SELF_ONLY |
| LinkedIn | Chưa có App/token; portal yêu cầu đăng nhập | Posts API NOT TESTED | Organization analytics NOT TESTED | Community Management review chưa bắt đầu | Thủ công | Chưa xác minh Organization URN/Page role |
| Zalo | Chưa có Zalo App/OA token; portal yêu cầu đăng nhập | Article/video OA API NOT TESTED | OA analytics NOT TESTED | OA/App/plan chưa xác minh | Thủ công | `zalo.me/0932773999` chỉ là contact link công khai, không phải OA ID evidence |
| Website | Application Password + authenticated `/users/me` PASS | NOT TESTED | Chưa test | N/A | Bán tự động | Website đang xây dựng; connectivity check chỉ dùng GET read-only |
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
- Website: `GET https://anninhcanhve.com/wp-json/` trả HTTP 200, namespace `wp/v2` và Application Password discovery PASS. Authenticated `GET /wp-json/wp/v2/users/me?context=edit` từ Cloud Run revision `ancv-marketing-backend-00021-zkt` trả HTTP 200 cho `editor01`.
- Hai secret đều có version enabled và được mount vào Cloud Run bằng `ancv-cloud-run@ancv-marketing-ai-agent.iam.gserviceaccount.com`; không ghi credential vào source/log/Firestore.
- WordPress API trả role thực tế `administrator` cho `editor01`, khác với role `Editor` được cung cấp ban đầu. Không thay đổi role; phải rà lại trong WordPress Admin trước khi cho phép write trong tương lai.
- Không gửi request POST/PUT/PATCH/DELETE tới WordPress. Write access, media upload và publishing đều NOT TESTED.
- Kết quả được lưu trong Firestore `connectorTests`; snapshot mới nhất được merge vào `connectors/{platform}`.

## Authentication production đề xuất

- GA4 và Search Console: ưu tiên runtime Service Account hiện có, dùng Cloud Run ADC và cấp quyền trực tiếp trên đúng property; không tạo JSON key. User OAuth chỉ là fallback nếu property thực tế không chấp nhận mô hình này; khi đó dùng OAuth client riêng và refresh token trong Secret Manager.
- WordPress: user kỹ thuật riêng với quyền tối thiểu cần thiết + Application Password qua HTTPS; username/password lưu trong Secret Manager và có thể rotate không sửa source.

## Nguồn chính thức

- OpenAI: [Responses API/model guidance](https://developers.openai.com/api/docs/guides/latest-model), [GPT Image 2](https://developers.openai.com/api/docs/models/gpt-image-2).
- GA4: [Data API quickstart](https://developers.google.com/analytics/devguides/reporting/data/v1/quickstart), [Admin API quickstart](https://developers.google.com/analytics/devguides/config/admin/v1/quickstart), [Data API quotas](https://developers.google.com/analytics/devguides/reporting/data/v1/quotas).
- Search Console: [OAuth authorization](https://developers.google.com/webmaster-tools/v1/how-tos/authorizing), [property users and permissions](https://support.google.com/webmasters/answer/7687615), [Search Analytics query](https://developers.google.com/webmaster-tools/v1/searchanalytics/query), [usage limits](https://developers.google.com/webmaster-tools/limits).
- WordPress: [REST authentication](https://developer.wordpress.org/rest-api/using-the-rest-api/authentication/), [Application Passwords](https://developer.wordpress.org/rest-api/reference/application-passwords/).
- YouTube: [OAuth](https://developers.google.com/youtube/v3/guides/authentication), [Videos API](https://developers.google.com/youtube/v3/docs/videos), [Analytics reference](https://developers.google.com/youtube/analytics/reference), [quota/audit](https://developers.google.com/youtube/v3/guides/quota_and_compliance_audits).
- Facebook: [Pages posts](https://developers.facebook.com/documentation/pages-api/posts), [Page Insights](https://developers.facebook.com/docs/graph-api/reference/page/insights/), [Permissions](https://developers.facebook.com/docs/permissions), [App Review](https://developers.facebook.com/docs/app-review/).
- TikTok: [Direct Post](https://developers.tiktok.com/doc/content-posting-api-reference-direct-post), [Upload](https://developers.tiktok.com/doc/content-posting-api-reference-upload-video), [Display API](https://developers.tiktok.com/doc/display-api-overview), [Scopes](https://developers.tiktok.com/doc/tiktok-api-scopes), [sharing guidelines](https://developers.tiktok.com/doc/content-sharing-guidelines/).
- LinkedIn: [Posts API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api), [Community Management overview](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/community-management-overview), [App Review](https://learn.microsoft.com/en-us/linkedin/marketing/community-management-app-review), [rate limits](https://learn.microsoft.com/en-us/linkedin/shared/api-guide/concepts/rate-limits).
- Zalo: [OA OpenAPI overview](https://developers.zalo.me/docs/official-account/bat-dau/kham-pha), [OA Content API](https://developers.zalo.me/docs/official-account/noi-dung/tong-quan), [authorization](https://developers.zalo.me/docs/official-account/bat-dau/xac-thuc-va-uy-quyen-cho-ung-dung-new).

## Điều kiện chuyển `available`

Phải có đúng owner/resource, scope thực cấp, request nghiệp vụ production-like thành công, refresh-token lifecycle nếu dùng user OAuth, quota phù hợp và không còn review blocker. PASS một phần chỉ được `partially_available`; Admin vẫn có thể override về mode thấp hơn.

## Recheck Phase 2C — 2026-08-11

- WordPress connectivity-only: REST root, Application Password authentication và authenticated GET `/users/me` PASS từ production Cloud Run. Write/media/publishing đều NOT TESTED. Giữ `partially_available / semi_automatic` và Manual Fallback.
- GA4: `accountSummaries.list` bằng production Service Account PASS, `accessiblePropertyCount = 0`; `runReport` chưa được phép chạy và connector giữ manual/no-data.
- Search Console: `sites.list` bằng production Service Account PASS, `accessibleSiteCount = 0`; `searchAnalytics.query` chưa được phép chạy và connector giữ manual/no-data.
- Website HTML công khai không được dùng làm bằng chứng cho quyền GA4 Data API hoặc Search Console API.

## Evidence Phase 2E — Social API — 2026-08-11

- Identity pre-flight PASS: gcloud, Firebase và ADC đều là `nhat.ngtan@gmail.com`; project `ancv-marketing-ai-agent`; cả `nhat.ngtan@gmail.com` và `ancv.marketing@gmail.com` vẫn là Owner.
- Không có secret container mang tên YouTube/Facebook/Meta/LinkedIn/TikTok/Zalo. Không đọc hoặc ghi credential ngoài Secret Manager; không gọi OpenAI, Google Flow hoặc Social write API.
- YouTube Data API, YouTube Analytics API và YouTube Reporting API đã được bật trong đúng project ANCV. YouTube Studio bằng `ancv.marketing@gmail.com` xác minh kênh **Giải Pháp An Ninh Cảnh Vệ**, Channel ID `UCy-H7__UvdWcTbUax3RGDcA`.
- Request thật `channels.list(mine=true)` và `reports.query(channel==MINE)` bằng ADC đều trả HTTP 403 `insufficientPermissions`. Điều này xác nhận credential hiện tại thiếu YouTube OAuth scopes; không phải bằng chứng channel/API unavailable.
- Meta Developer, LinkedIn Developer, TikTok Developer và Zalo Developer portal đều dừng ở màn hình đăng nhập. Không có App ID/token nên không gửi request API giả hoặc request không có credential chỉ để tạo lỗi.
- Facebook Page candidate `anninhcanhve.chuyengiaanninh` trả “content unavailable”; không dùng URL cũ này làm bằng chứng Page còn tồn tại hoặc account có quyền.
- LinkedIn chưa tìm thấy Organization Page ANCV được xác minh; kết quả công khai chỉ cho thấy profile cá nhân trùng tên. TikTok chưa xác minh creator account. Website công khai chỉ có Zalo contact `0932773999`, chưa có OA ID.
- Firestore đã lưu một `connectorTests` record mới cho mỗi platform và merge snapshot vào `connectors/{platform}`. Cả 5 giữ `not_tested / manual`; UI Kết nối đọc trực tiếp các snapshot này và không cần deploy.

## Evidence Phase 2F-A — YouTube OAuth — 2026-08-11

- Consent thực hiện bằng `ancv.marketing@gmail.com` qua Desktop OAuth client chuyên biệt và loopback callback localhost. Firebase Web Client hiện có không bị thay đổi.
- Scope yêu cầu và scope thực cấp đều khớp: `youtube.readonly`, `youtube.upload`, `yt-analytics.readonly`. Client ID, client secret và refresh token được lưu riêng trong Secret Manager; không lưu token vào source, Git, Firestore hoặc tài liệu.
- Refresh-token exchange PASS. `channels.list(mine=true)` trả đúng **Giải Pháp An Ninh Cảnh Vệ**, Channel ID `UCy-H7__UvdWcTbUax3RGDcA`; không có account/channel mismatch.
- `reports.query` thật với `channel==MINE`, khoảng `2026-08-01..2026-08-07`, metric `views`, dimension `day` trả HTTP 200 và 7 dòng.
- Người dùng phê duyệt upload file `TD Di An BD 4.mp4`. `videos.insert` resumable tạo đúng 01 video `OSbbjviru7A`; đọc lại metadata xác nhận title `TEST PRIVATE - ANCV API - TD Di An BD 4`, đúng channel và `privacyStatus=private`.
- Upload có đúng 1 attempt, không retry. Evidence nằm ở `connectorTests/youtube-private-2afd0c97f552ce041e711816` và `connectorTests/youtube-oauth-feasibility-20260811`.
- Connector snapshot là `partially_available / semi_automatic`: Auth PASS, Analytics verified, Publishing partial. Chưa bật Automatic vì public/unlisted, update/delete/scheduling, OAuth verification và compliance audit chưa được xác minh.

### Capability theo tài liệu — chưa phải PASS

- YouTube: `videos.insert` hỗ trợ upload và metadata; project API chưa audit có upload bị giới hạn private. Analytics cần OAuth, gồm `yt-analytics.readonly` và hiện còn yêu cầu `youtube.readonly` cho query.
- Facebook: Page post/text/link/photo/video được Pages API hỗ trợ; cần Page token và các quyền thực cấp như `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `publish_video`. Page Insights cần `read_insights`, `pages_read_engagement` và task `ANALYZE`; nhiều permission/Advanced Access cần App Review và Business Verification.
- LinkedIn: Posts API hỗ trợ text, image, video và article; Organization publishing/reading cần `w_organization_social`/`r_organization_social` cùng Page role. Community Management là vetted product; Development tier mặc định 500 calls/app/24h và 100 calls/member/app/24h.
- TikTok: Direct Post dùng `video.publish`; Upload-to-inbox dùng `video.upload`; init tối đa 6 requests/phút/user token. Unaudited client bị private/SELF_ONLY và active-user/posting caps. Display API có `user.info.*`/`video.list` và public-video metrics, không mặc định bằng marketing analytics đầy đủ.
- Zalo: OA OpenAPI yêu cầu Zalo OA + Zalo App được cấp quyền; tài liệu Nội dung hỗ trợ tạo/xuất bản/cập nhật/quản lý bài viết và video. Zalo có thể yêu cầu gói OA/tính năng trả phí; analytics và hạn mức thực tế chưa xác minh.
