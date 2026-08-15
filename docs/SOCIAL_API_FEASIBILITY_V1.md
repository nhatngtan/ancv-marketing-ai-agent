# Social API Feasibility V1

Cập nhật: 2026-08-15. Phạm vi chỉ đọc: không gửi bài, tải media, tạo draft, đổi quyền hoặc khởi chạy OAuth. Mọi capability chưa có request authenticated thật đều là `NOT TESTED`.

## Kết luận

| Platform | Resource ANCV | Auth/API request | Capability theo tài liệu | Blocker chính | Verdict |
| --- | --- | --- | --- | --- | --- |
| Facebook | Page candidate `anninhcanhve.chuyengiaanninh`; Page ID và quyền quản trị chưa xác minh | Không có Meta App/Page token; không gửi request | Pages API có post/photo/video và Page Insights | Tạo/nhận đúng Meta App, xác minh Page + Page task, OAuth scopes, App Review/Advanced Access và Business Verification khi áp dụng | `NEED_ACCOUNT_SETUP` |
| TikTok | Chưa xác minh creator account/open ID | Không có Developer App/token; không gửi request | Direct Post hỗ trợ video/photo; Upload-to-inbox hỗ trợ video và yêu cầu người dùng hoàn tất trong TikTok | Use case Direct Post nội bộ cho account của chính đội ngũ bị guideline nêu là không chấp nhận; chưa có app/account/audit | `MANUAL_ONLY` |
| LinkedIn | Chưa xác minh Organization Page/URN hoặc Page role | Không có LinkedIn App/token; không gửi request | Posts API hỗ trợ text/image/video/article | Cần Organization Page + role, legal-organization vetting và Community Management Development/Standard approval | `NEED_ACCOUNT_SETUP` |
| Zalo | Website chỉ công khai `zalo.me/0932773999`; đây không phải OA ID evidence | Không có Zalo App/OA token/OA ID; không gửi request | OA OpenAPI có nhóm API quản lý nội dung, nhưng quyền create/publish và hạn mức ANCV chưa được xác minh | Xác minh/tạo đúng OA, liên kết Zalo App, ủy quyền OA và kiểm tra plan/quyền/token lifecycle | `NEED_ACCOUNT_SETUP` |

Không platform nào đạt `AUTOMATE_NOW`. Core và Manual Fallback giữ nguyên; không có nút publish API mới.

## Facebook

- Account/Page: public search chỉ tìm lại URL Page candidate cũ; website production không công khai Facebook link. Không có Page ID hoặc evidence account ANCV có Page task phù hợp.
- Authentication: cần Meta App, user consent và Page access token. Secrets production chưa có container/token Meta/Facebook.
- Permissions cần kiểm thử tối thiểu: `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`; video/Insights cần xác minh thêm permission/capability thực cấp như `publish_video`, `read_insights` theo API version và use case của app.
- Text/Image/Video: được Pages API mô tả, nhưng tất cả `NOT TESTED` cho ANCV.
- Draft/private: không coi unpublished/scheduled Page post là PASS; chưa có request/schema thực tế của App ANCV.
- Review: Standard Access chỉ đủ trong phạm vi role của app/Page; mở rộng cho user/Page ngoài role có thể cần Advanced Access, App Review và Business Verification.
- Token: chưa có token nên refresh/expiry `NOT TESTED`; production phải lưu trong Secret Manager và fail-closed khi bị revoke/expire.
- Rate limit: phụ thuộc app/use case/API version; chỉ ghi quota thật sau khi app có request và dashboard usage evidence.
- Idempotency: chưa xác minh Meta có idempotency key cho Page post. Publisher tương lai phải lưu intent trước request, không retry write khi kết quả không chắc chắn, rồi lookup theo returned post ID/evidence.
- Verdict: `NEED_ACCOUNT_SETUP`.

## TikTok

- Account: chưa xác minh username/open ID/creator eligibility của ANCV.
- Authentication: OAuth user token; Direct Post dùng `video.publish`, Upload-to-inbox dùng `video.upload`. Access token mặc định 24 giờ, refresh token 365 ngày; refresh token mới phải thay thế token cũ khi response rotate.
- Text/Image/Video: Direct Post hỗ trợ video và photo. Không có endpoint text-only trong Content Posting evidence đã kiểm tra. Upload-to-inbox là handoff: người dùng phải mở notification trong TikTok để chỉnh và hoàn tất post.
- Draft/private: unaudited Direct Post chỉ `SELF_ONLY`; đây không phải draft. Upload-to-inbox chưa phải direct publish.
- Audit/use case: guideline hiện nêu ứng dụng nội bộ chỉ giúp đội ngũ upload vào account mình quản lý là use case không được chấp nhận cho Direct Post. Do đó không thiết kế automation Direct Post production cho ANCV nếu TikTok chưa phê duyệt rõ use case.
- Rate limit: init Direct Post/Upload tối đa 6 request/phút/user token; Upload-to-inbox tối đa 5 pending shares trong 24 giờ. Direct Post còn active-user/posting caps.
- Idempotency: API trả `publish_id` để theo dõi trạng thái nhưng không có idempotency key được xác minh. Phải lưu `publish_id`, không init lại khi timeout không chắc chắn.
- Verdict: `MANUAL_ONLY` cho direct publishing; Upload-to-inbox chỉ được đánh giá lại sau account/app setup và approval phù hợp.

## LinkedIn

- Account/Organization: public search chỉ cho thấy profile cá nhân tên An Ninh Cảnh Vệ; chưa có Organization Page/URN được xác minh.
- Authentication: OAuth member token gắn với member có Page role. Organization post/read cần `w_organization_social`/`r_organization_social`; role hợp lệ gồm Administrator, Direct Sponsored Content Poster hoặc Content Admin theo operation.
- Text/Image/Video/Article: Posts API hỗ trợ organic text, image, video, document, article và multi-image. Media cần upload asset trước rồi dùng URN.
- Draft/private: create samples chính thức dùng `lifecycleState=PUBLISHED`; tài liệu có thể trả state `DRAFT`/`PROCESSING` trong author view nhưng chưa chứng minh general organic draft creation. Vì vậy Draft = `NOT TESTED`, không dùng dark post như draft thường.
- Review: Community Management chỉ dành cho registered legal organizations/commercial use; cần business email/domain, Organization Page xác minh app, Development tier review; Standard tier yêu cầu integration và screencast/re-review.
- Token: access token mặc định 60 ngày. Programmatic refresh token 365 ngày chỉ dành cho approved Marketing Developer Platform partners; hết hạn cần member reauthorize.
- Rate limit: application-level và member-level theo chu kỳ 24 giờ; số cụ thể phụ thuộc endpoint/app và chỉ thấy trong Developer Portal sau request. Không dùng con số quota cố định cũ.
- Idempotency: Posts API trả post URN qua `x-restli-id`; chưa có idempotency key được xác minh. Lưu intent + URN và không retry khi create outcome không chắc chắn.
- Verdict: `NEED_ACCOUNT_SETUP` (sau đó `NEED_APP_REVIEW`).

## Zalo

- Account/OA: chỉ có link contact `zalo.me/0932773999`; không có evidence đây là Official Account hoặc OA ID.
- Authentication: OA OpenAPI cần Zalo App được OA ủy quyền và OA access token. App/OA/token production đều chưa tồn tại trong project.
- Text/Image/Video: tài liệu OA có nhóm Nội dung/bài viết/video, nhưng create/update/publish thực tế đều `NOT TESTED`.
- Draft/private: `NOT TESTED`; không suy ra từ tên endpoint hoặc UI portal.
- Token/plan/rate limit: `NOT TESTED`; phải lấy evidence từ đúng OA/App và gói đang dùng trước khi thiết kế scheduler/retry.
- Idempotency: chưa xác minh API hỗ trợ idempotency key; future connector phải lưu intent/remote ID và fail-closed khi outcome không chắc chắn.
- Verdict: `NEED_ACCOUNT_SETUP`.

## Evidence local/production

- GCP active account: `nhat.ngtan@gmail.com`; project: `ancv-marketing-ai-agent`.
- Secret Manager chỉ có OpenAI, WordPress và YouTube OAuth secrets; không có secret Facebook/Meta/TikTok/LinkedIn/Zalo.
- Firestore `connectors/{facebook,tiktok,linkedin,zalo}` đều `not_tested / manual`, `credentialsConfigured=false`, `apiRequestPerformed=false`.
- Website `https://anninhcanhve.com` chỉ công khai Zalo contact link; không có Facebook/TikTok/LinkedIn link trong HTML hiện tại.
- Không gửi POST/PUT/PATCH/DELETE hoặc authenticated read request đến bốn platform vì không có credential hợp lệ.

## Nguồn chính thức

- Facebook: [Pages API](https://developers.facebook.com/docs/pages-api/), [Pages posts](https://developers.facebook.com/documentation/pages-api/posts), [Permissions](https://developers.facebook.com/docs/permissions), [App Review](https://developers.facebook.com/docs/app-review/).
- TikTok: [Direct Post](https://developers.tiktok.com/doc/content-posting-api-reference-direct-post), [Upload-to-inbox](https://developers.tiktok.com/doc/content-posting-api-reference-upload-video), [Content Sharing Guidelines](https://developers.tiktok.com/doc/content-sharing-guidelines/), [OAuth token lifecycle](https://developers.tiktok.com/doc/oauth-user-access-token-management).
- LinkedIn: [Posts API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api), [Community Management App Review](https://learn.microsoft.com/en-us/linkedin/marketing/community-management-app-review), [Organization roles](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/organizations/organization-access-control-by-role), [OAuth refresh tokens](https://learn.microsoft.com/en-us/linkedin/shared/authentication/programmatic-refresh-tokens), [rate limits](https://learn.microsoft.com/en-us/linkedin/shared/api-guide/concepts/rate-limits).
- Zalo: [OA OpenAPI overview](https://developers.zalo.me/docs/official-account/bat-dau/kham-pha), [OA Content](https://developers.zalo.me/docs/official-account/noi-dung/tong-quan), [app authorization](https://developers.zalo.me/docs/official-account/bat-dau/xac-thuc-va-uy-quyen-cho-ung-dung-new).

