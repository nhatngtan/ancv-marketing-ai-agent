# Roadmap

## Giai đoạn 1 — Core OS

Web/Firebase/Auth/Firestore/Storage, Video/Article CRUD, transaction Content ID, Dashboard, connector model, manual fallback, system health, Cloud Run, Workflows/Tasks/Scheduler foundation, Security Rules và tài liệu.

## Giai đoạn 2 — Feasibility thực tế

Tạo app/OAuth đúng owner ANCV; test lần lượt YouTube, GA4, Search Console, Website CMS, rồi các social còn lại. Lưu request metadata đã redact vào `connectorTests`. Không viết full automation trước PASS.

## Giai đoạn 3 — Connector production

Implement phần PASS qua `PublishingProvider`/`AnalyticsProvider`; token trong Secret Manager; scheduler chỉ gọi connector đủ trạng thái. Test revoke token, quota, partial failure và idempotent replay.

## Experimental

Flow Worker dùng browser automation với timeout, screenshot lỗi, retry có giới hạn và manual upload. Không tự động hóa CapCut ở giai đoạn đầu.

