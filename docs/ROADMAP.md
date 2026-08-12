# Roadmap

## Giai đoạn 1 — Core OS

Web/Firebase/Auth/Firestore/Storage, Video/Article CRUD, transaction Content ID, Dashboard, connector model, manual fallback, system health, Cloud Run, Workflows/Tasks/Scheduler foundation, Security Rules và tài liệu.

## Giai đoạn 2A — Feasibility thực tế

Tạo app/OAuth đúng owner ANCV; test lần lượt YouTube, GA4, Search Console, Website CMS, rồi các social còn lại. Lưu request metadata đã redact vào `connectorTests`. Không viết full automation trước PASS.

## Giai đoạn 2B — AI Content Studio

Hoàn thiện Video/Article Studio, structured scene, Google Flow prompt manual fallback, Video Raw takes, CapCut handoff, Video Final, platform copy riêng, Article/image generation, Company Profile, approval, `aiJobs`, `aiUsage`, audit và cost protection. Không tự publish.

## Giai đoạn 2C — Connectivity và UAT

Core production/UAT đã PASS. GA4, Search Console và WordPress giữ safe mode theo quyền thực tế. WordPress hiện chỉ cho phép connectivity test bằng GET read-only; write/media/publishing chưa được kiểm tra.

## Giai đoạn 2D — Google Flow Worker Experimental V1

Foundation local một job/một profile/một account tại một thời điểm. Chỉ đánh dấu PASS sau preflight UI thật và đúng một Scene smoke test; Flow Worker vẫn experimental, có manual fallback và không được trở thành dependency của Core.

Kết quả 2026-08-11: smoke đầu phát hiện cấu hình mặc định `x2`; sau khi Worker bắt buộc `x1`, strict smoke được phê duyệt riêng đã PASS với đúng một lần Generate, output tăng đúng một, một MP4/Storage object/`mediaAssets`, Scene và Job `succeeded`, không duplicate và file tạm đã cleanup. Trạng thái Flow Worker V1 là **EXPERIMENTAL / AVAILABLE**; Manual Fallback vẫn được giữ và Core không phụ thuộc Flow.

### Giai đoạn 2D.3 — Local Agent + Browser Bridge + Local-first

Ngày 2026-08-12: Local Agent/Task Scheduler, heartbeat, dedicated Chrome profile, loopback Browser Bridge, UI Local/Cloud, open-folder command, Firestore job ownership và default local-first đã PASS. Một smoke Generate được click đúng một lần nhưng Flow không tăng output count trong timeout 15 phút; job dừng `needs_manual`, không retry, không asset và không Firebase upload. Trạng thái **PARTIAL**; xem [UAT_PHASE_2D3.md](UAT_PHASE_2D3.md).

## Giai đoạn 3 — Distribution Connector production

Implement phần PASS qua `PublishingProvider`/`AnalyticsProvider`; token trong Secret Manager; scheduler chỉ gọi connector đủ trạng thái. Test revoke token, quota, partial failure và idempotent replay.

## Experimental

Flow Worker dùng browser automation với timeout, screenshot lỗi, retry có giới hạn và manual upload. Không tự động hóa CapCut ở giai đoạn đầu.
