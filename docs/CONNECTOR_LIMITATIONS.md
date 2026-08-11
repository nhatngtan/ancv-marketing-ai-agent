# Connector Limitations

| Connector | Giới hạn / evidence hiện tại | Chưa xác minh cho ANCV | Safe mode |
| --- | --- | --- | --- |
| YouTube | OAuth/refresh PASS; `channels.list(mine=true)` đúng channel; Analytics HTTP 200; đúng 01 `videos.insert` PRIVATE PASS, Video ID `OSbbjviru7A`, không retry | Public/unlisted, update/delete/scheduling, OAuth verification, compliance audit và quota khi vận hành định kỳ | Semi-automatic |
| Facebook | Chưa có Meta App/Page token; portal yêu cầu login; Page candidate cũ trả unavailable. Docs xác nhận post/photo/video + Insights có API nhưng không phải evidence quyền ANCV | Page ID và Page task, app ownership/transfer, `pages_*`, `publish_video`, `read_insights`, App Review/Business Verification, request thật | Manual |
| TikTok | Chưa có App/token/creator evidence. Docs: `video.publish` Direct Post, `video.upload` inbox; unaudited chỉ private/SELF_ONLY, init 6 request/phút/token | Developer app, creator eligibility, OAuth scopes, refresh token, audit, domain/URL ownership, request creator info/read/upload an toàn | Manual |
| LinkedIn | Chưa có App/token/Organization URN. Community Management là vetted product; Development tier 500 calls/app và 100 calls/member/24h | Organization Page/role, legal-org vetting, app ownership/transfer, scopes, Development/Standard approval, request thật | Manual |
| Zalo | Chưa có App/OA token/OA ID; public contact `zalo.me/0932773999` không chứng minh OA. Docs hỗ trợ article/video content nhưng analytics chưa xác minh | OA ownership/ID, Zalo App authorization, token lifecycle, OA/ZCA plan, content/analytics endpoints và hạn mức request thật | Manual |
| Website | WordPress REST root, Application Password auth và authenticated `/users/me` PASS bằng GET từ production Cloud Run | Write/media/publishing chủ ý NOT TESTED; API trả role `administrator` khác role `Editor` được cung cấp | Semi-automatic |
| GA4 | Runtime Service Account auth/list PASS nhưng thấy 0 property; development UI không có property ANCV | Tạo/chọn property, property ID, cấp Viewer cho production SA, `runReport`, metrics/dimensions/date range/quota | No data / Manual |
| Search Console | Runtime Service Account auth/list PASS nhưng thấy 0 property; development UI không có `anninhcanhve.com` | Verify property, cấp quyền production SA, query clicks/impressions/CTR/position | No data / Manual |
| OpenAI | Responses + Image API request thật PASS từ production Service Account; secret được mount từ Secret Manager | Theo dõi quota/billing và rotate key doanh nghiệp khi bàn giao | Automatic |

GA4/Search Console không dùng các property cá nhân/cũ đang thấy trong account development. Nếu phải dùng user OAuth thay Service Account, OAuth client và refresh token phải thuộc ANCV, lưu Secret Manager, có quy trình chuyển admin và revoke.

WordPress credentials được mount từ Secret Manager, không commit và không lưu Firestore. Application Password thuộc `editor01`, có thể revoke độc lập với mật khẩu đăng nhập. API thực tế báo user này có role `administrator`; đây là mismatch cần rà lại, không phải quyền cho phép tự động write. Trong khi Website đang xây dựng, connector chỉ được gửi GET; không test bài viết, draft, media, category/tag hoặc publishing.

Connector error không xóa snapshot cũ. Dashboard hiển thị dữ liệu cập nhật lần cuối hoặc “Dữ liệu không khả dụng”, không thay dữ liệu thiếu bằng số 0 giả.

Phase 2E không gửi POST/PUT/PATCH/DELETE đến bất kỳ social platform nào. `not_tested` có nghĩa là credential/request nghiệp vụ chưa PASS; không đồng nghĩa tài liệu không có endpoint hoặc nền tảng vĩnh viễn unavailable.

Phase 2F-A chỉ thay đổi YouTube. OAuth credential thuộc project ANCV và refresh token consent bởi `ancv.marketing@gmail.com`; tất cả nằm trong Secret Manager. Upload feasibility duy nhất là video `OSbbjviru7A` ở chế độ Private. Không được dùng PASS này để suy ra public publishing, scheduling, update/delete hay production automation đã được duyệt. Manual fallback vẫn là chế độ vận hành chính thức.

## Ownership và bàn giao

Không tạo developer app production nếu chưa xác minh nền tảng cho phép thêm admin doanh nghiệp hoặc transfer owner. Credential development phải được đánh dấu và rotate bằng Secret Manager/configuration, không sửa business logic. Checklist ở [HANDOVER.md](HANDOVER.md).
