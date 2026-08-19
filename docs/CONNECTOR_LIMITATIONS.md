# Connector Limitations

| Connector | Giới hạn / evidence hiện tại | Chưa xác minh cho ANCV | Safe mode |
| --- | --- | --- | --- |
| YouTube | OAuth/refresh PASS; `channels.list(mine=true)` đúng channel; Analytics HTTP 200; đúng 01 `videos.insert` PRIVATE PASS, Video ID `OSbbjviru7A`, không retry. Luồng public/schedule có idempotency và verify trong code/test | Public/schedule chưa có external write UAT; update/delete, OAuth verification, compliance audit và quota khi vận hành định kỳ | Semi-automatic |
| Facebook | Chưa có Meta App/Page token; Page ID/ownership chưa xác minh. Docs xác nhận post/photo/video + Insights có API nhưng không phải evidence quyền ANCV | Page task, app ownership/transfer, `pages_*`, video/Insights permissions, App Review/Advanced Access/Business Verification, request thật | Manual — `NEED_ACCOUNT_SETUP` |
| TikTok | Chưa có App/token/creator evidence. Direct Post unaudited chỉ SELF_ONLY; guideline không chấp nhận utility chỉ upload cho account nội bộ của đội ngũ | Nếu theo đuổi Upload-to-inbox: Developer app, creator eligibility, OAuth, audit/review và request thật; Direct Post giữ manual nếu TikTok không phê duyệt use case | Manual — `MANUAL_ONLY` |
| LinkedIn | Chưa có App/token/Organization URN. Community Management là vetted product; quota số cụ thể không được docs công bố | Organization Page/role, legal-org vetting, app ownership/transfer, scopes, Development/Standard approval, request thật và quota portal | Manual — `NEED_ACCOUNT_SETUP` |
| Zalo | Chưa có App/OA token/OA ID; public contact `zalo.me/0932773999` không chứng minh OA. Docs có nhóm Content nhưng mọi capability ANCV đều chưa test | OA ownership/ID, Zalo App authorization, token lifecycle, OA/ZCA plan, content/analytics endpoints và hạn mức request thật | Manual — `NEED_ACCOUNT_SETUP` |
| Website | REST/Auth PASS; đúng 01 media upload + đúng 01 draft UAT PASS (Post `801`, Media `800`); Yoast write field không được expose. Luồng cập nhật chính Post hiện có sang publish/future có idempotency và verify trong code/test | Publish/schedule external write UAT chưa chạy; API trả role `administrator`; Yoast `NOT_SYNCED_TO_YOAST` | Semi-automatic |
| GA4 | Runtime Service Account auth/list PASS nhưng thấy 0 property; development UI không có property ANCV | Tạo/chọn property, property ID, cấp Viewer cho production SA, `runReport`, metrics/dimensions/date range/quota | No data / Manual |
| Search Console | Runtime Service Account auth/list PASS nhưng thấy 0 property; development UI không có `anninhcanhve.com` | Verify property, cấp quyền production SA, query clicks/impressions/CTR/position | No data / Manual |
| OpenAI | Responses + Image API request thật PASS từ production Service Account; secret được mount từ Secret Manager | Theo dõi quota/billing và rotate key doanh nghiệp khi bàn giao | Automatic |

GA4/Search Console không dùng các property cá nhân/cũ đang thấy trong account development. Nếu phải dùng user OAuth thay Service Account, OAuth client và refresh token phải thuộc ANCV, lưu Secret Manager, có quy trình chuyển admin và revoke.

WordPress credentials được mount từ Secret Manager, không commit và không lưu Firestore. Application Password thuộc `editor01`, có thể revoke độc lập với mật khẩu đăng nhập. API thực tế báo user này có role `administrator`; đây là mismatch cần rà lại. UAT write duy nhất được cho phép là Post `801` + Media `800`, giữ `draft`; publish/schedule và các write khác chưa được phép.

Connector error không xóa snapshot cũ. Dashboard hiển thị dữ liệu cập nhật lần cuối hoặc “Dữ liệu không khả dụng”, không thay dữ liệu thiếu bằng số 0 giả.

Phase 2E không gửi POST/PUT/PATCH/DELETE đến bất kỳ social platform nào. `not_tested` có nghĩa là credential/request nghiệp vụ chưa PASS; không đồng nghĩa tài liệu không có endpoint hoặc nền tảng vĩnh viễn unavailable.

Social API Feasibility V1 (2026-08-15) không có platform `AUTOMATE_NOW`. Không có credential để chạy authenticated read test; không khởi chạy OAuth chỉ để đổi trạng thái. Chi tiết: [SOCIAL_API_FEASIBILITY_V1.md](SOCIAL_API_FEASIBILITY_V1.md).

Từ 2026-08-19, onboarding API Facebook/TikTok/Zalo/LinkedIn là **DEFERRED BY OWNER**. Giữ Manual Social Handoff; không tiếp tục Developer App, OAuth, App Review, Business Verification hoặc browser automation social.

Phase 2F-A chỉ thay đổi YouTube. OAuth credential thuộc project ANCV và refresh token consent bởi `ancv.marketing@gmail.com`; tất cả nằm trong Secret Manager. Upload feasibility duy nhất là video `OSbbjviru7A` ở chế độ Private. Không được dùng PASS này để suy ra public publishing, scheduling, update/delete hay production automation đã được duyệt. Manual fallback vẫn là chế độ vận hành chính thức.

## Ownership và bàn giao

Không tạo developer app production nếu chưa xác minh nền tảng cho phép thêm admin doanh nghiệp hoặc transfer owner. Credential development phải được đánh dấu và rotate bằng Secret Manager/configuration, không sửa business logic. Checklist ở [HANDOVER.md](HANDOVER.md).
