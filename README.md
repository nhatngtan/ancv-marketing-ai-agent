# QUẢN TRỊ MARKETING AI AGENT - ANCV

Web App production: https://ancv-marketing-ai-agent.web.app

Backend production: https://ancv-marketing-backend-er6fbprpra-as.a.run.app

## START HẰNG NGÀY

1. Bật máy Windows; `ANCV Local Agent` tự chạy bằng Task Scheduler.
2. Mở [Marketing AI OS](https://ancv-marketing-ai-agent.web.app).
3. Mở **Tình trạng hệ thống** và xác nhận **ANCV Local Agent — Hoạt động**.
4. Bắt đầu tạo/chỉnh sửa Video Content hoặc Article Content.

Workspace file thật: `D:\ANCV Marketing`. Video do Flow tạo được lưu local-first; Firestore chỉ giữ metadata và đường dẫn tương đối để có thể đổi `workspaceRoot` khi bàn giao máy.

Google Flow đang ở trạng thái **Available / Experimental**. Nếu Local Agent, Browser Bridge, Flow hoặc connector ngoài chưa sẵn sàng, Core vẫn hoạt động: Video dùng **Copy Prompt → Flow thủ công → Video Raw local**; Article/Social dùng **Copy → đăng thủ công → Đã đăng thủ công**. Social profile có thể cấu hình sau Launch.

Core Marketing OS của Công ty An Ninh Cảnh Vệ. Hệ thống quản lý Content, publishing theo từng nền tảng, connector feasibility, manual fallback, system health và dữ liệu báo cáo nội bộ. Connector bên ngoài là plugin; lỗi hoặc mất quyền API không làm mất Content hay khóa pipeline.

## Trạng thái production — Launch v1.0.0

- Web App React/TypeScript có Video Content Studio, Article Content Studio, Scene Editor, Media Library, Company Profile, Dashboard usage và quy trình duyệt.
- Firebase Auth/Firestore/Storage/Hosting đã có cấu hình production; deployment chỉ chạy sau identity pre-flight.
- Cloud Run backend có `/health`, `/connectors/health`, transaction Content ID, publishing/manual fallback và retry policy.
- Workflows, Cloud Tasks, Scheduler và service-account bootstrap có script tái tạo.
- YouTube đang `partially_available / semi_automatic`; WordPress read-only PASS; Flow `Available / Experimental`. GA4/GSC và các Social chưa cấu hình tiếp tục manual/safe mode, không chặn Core.

## AI Content Studio — Giai đoạn 2B

- OpenAI Responses API dùng Structured Outputs cho scene/article/platform copy; Image API tạo ảnh theo thao tác chủ động. MASTER SCRIPT luôn do người dùng nhập.
- Mọi AI action yêu cầu Firebase editor, có idempotency key, `aiJobs`, `aiUsage`, audit log, rate limit và retry giới hạn.
- Ảnh AI được lưu Cloud Storage; Video Raw/Final được upload thủ công. Google Flow và CapCut không phải dependency.
- AI không tự publish: Content phải được người dùng chỉnh sửa, duyệt rồi mới chuyển `ready_to_publish`.
- GA4, Search Console và Website có feasibility runner riêng; kết quả lưu vào `connectorTests` và cập nhật `connectors`.
- Website runner chặn private/loopback target, giới hạn redirect và timeout để tránh SSRF/chi phí treo.
- System Health đọc trạng thái backend; connector chưa PASS tiếp tục manual/semi-automatic.
- Ownership development/bàn giao được ghi tại [docs/HANDOVER.md](docs/HANDOVER.md).

## Chạy local

Yêu cầu Node.js 22+.

```powershell
corepack enable
pnpm.cmd install --frozen-lockfile
pnpm.cmd run dev
pnpm.cmd run dev:backend
```

Khi chưa có Firebase config, Web App dùng dữ liệu demo cô lập trong trình duyệt và hiển thị cảnh báo rõ ràng. Sao chép `apps/web/.env.example` thành `.env.local` sau khi có Firebase Web App config chính thức. Không commit file môi trường.

## Kiểm thử

```powershell
pnpm.cmd run verify
firebase.cmd --config firebase.json emulators:exec --project demo-ancv "pnpm.cmd run test"
```

## Triển khai

1. Chạy `scripts/identity-preflight.ps1`.
2. Chỉ tiếp tục khi Google/Firebase đều là `nhat.ngtan@gmail.com`.
3. Chạy `scripts/bootstrap-gcp.ps1`, liên kết Billing nếu Google yêu cầu.
4. Khởi tạo Firebase/Firestore/Auth theo [DEPLOYMENT.md](DEPLOYMENT.md).
5. Chạy `scripts/deploy.ps1 -ProjectId <project-id>`.

## Cấu trúc

```text
apps/web                 Web App
services/backend         Cloud Run API
packages/shared          Domain model dùng chung
firebase                 Rules, indexes, Hosting config
infra                    Workflows và Scheduler declarations
scripts                  Identity, bootstrap, deploy, health checks
docs                     Feasibility, limitations, fallback, roadmap
```

Luồng sử dụng chi tiết: [docs/AI_CONTENT_PIPELINE.md](docs/AI_CONTENT_PIPELINE.md). Theo dõi usage: [docs/OPENAI_USAGE.md](docs/OPENAI_USAGE.md).

Final UAT production: [docs/UAT_PHASE_3.md](docs/UAT_PHASE_3.md). Evidence Giai đoạn 2C trước đó: [docs/UAT_PHASE_2C.md](docs/UAT_PHASE_2C.md).

Google Flow Worker Experimental V1, cách đăng nhập Chrome thật và kết quả smoke: [docs/FLOW_WORKER.md](docs/FLOW_WORKER.md).

ANCV Local Agent local-first và Browser Bridge: [docs/LOCAL_AGENT.md](docs/LOCAL_AGENT.md), [docs/BROWSER_BRIDGE.md](docs/BROWSER_BRIDGE.md).

Chrome Profile Selector và social preflight chỉ đọc: [docs/SOCIAL_BROWSER_AGENT.md](docs/SOCIAL_BROWSER_AGENT.md).
