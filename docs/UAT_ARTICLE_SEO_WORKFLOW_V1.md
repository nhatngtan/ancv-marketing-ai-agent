# UAT — Article SEO Workflow V1

Ngày: 2026-08-15  
Production Web: `https://ancv-marketing-ai-agent.web.app/`  
Backend revision: `ancv-marketing-backend-00048-bzm`

## Fixture

- Content ID: `ANCV-ART-2026-002`
- Tiêu đề: `ANCV ARTICLE SEO WORKFLOW V1 TEST`
- Trạng thái cuối: `approved`
- Focus keyword input: để trống; AI suy ra `lựa chọn dịch vụ bảo vệ doanh nghiệp`.

## Website Article

- SEO Title: `Tiêu chí lựa chọn dịch vụ bảo vệ doanh nghiệp phù hợp vận hành`
- H1: `Tiêu chí lựa chọn dịch vụ bảo vệ doanh nghiệp phù hợp nhu cầu vận hành`
- Slug: `tieu-chi-lua-chon-dich-vu-bao-ve-doanh-nghiep`
- Meta Description: có và được lưu riêng.
- Body: có H2/H3, danh sách, CTA phù hợp và không dùng số liệu/chứng nhận/cam kết chưa xác minh.
- Deterministic SEO checklist: `9/9`.

## Image và Social

- Tạo đúng 01 ảnh `1024x1024`, quality `low`; ảnh được lưu Storage.
- Ảnh chính đã chọn với alt text: `Nhân sự doanh nghiệp cùng rà soát sơ đồ khu vực cần kiểm soát an ninh`.
- Facebook, Zalo, LinkedIn được tạo tuần tự từ Article canonical đã lưu.
- Cả ba social copy có trạng thái `approved`; Article có trạng thái `approved`.

## WordPress preflight — read-only

- `GET /wp-json/`: PASS.
- Authenticated `GET /wp-json/wp/v2/users/me?context=edit`: PASS.
- Authenticated `GET /wp-json/wp/v2/posts?context=edit&per_page=1`: PASS.
- Site: `An ninh cảnh vệ` / `https://anninhcanhve.com`.
- User: `editor01`; REST API trả role `administrator` (khác mô tả Editor ban đầu; không thay đổi role).
- Capability discovery: `edit_posts=true`, `upload_files=true`; post/media create routes được advertised.
- Yoast namespace: `yoast/v1`; response post expose `yoast_head` và `yoast_head_json`.
- WordPress write request: `0`.
- Draft/media/publishing: `NOT TESTED` cho đến khi người dùng xác nhận UAT write.

## Verification

- Lint: PASS.
- TypeScript: PASS.
- Backend: 10 files / 43 tests PASS.
- Web: 11 tests PASS, 5 emulator tests skipped theo cấu hình hiện tại.
- Flow Worker regression: 3 files / 26 tests PASS; không Generate Flow.
- Production build: PASS.
- Cloud Run health: PASS; OpenAI operational.
- Hosting: HTTP 200.

Kết luận: `READY_FOR_WORDPRESS_DRAFT_UAT = YES`. Dừng trước mọi WordPress write.

