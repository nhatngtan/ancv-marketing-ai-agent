# QUẢN TRỊ MARKETING AI AGENT - ANCV

Core Marketing OS của Công ty An Ninh Cảnh Vệ. Hệ thống quản lý Content, publishing theo từng nền tảng, connector feasibility, manual fallback, system health và dữ liệu báo cáo nội bộ. Connector bên ngoài là plugin; lỗi hoặc mất quyền API không làm mất Content hay khóa pipeline.

## Trạng thái Giai đoạn 1

- Web App React/TypeScript, responsive, có Dashboard, Video/Article CRUD, Kết nối và Tình trạng hệ thống.
- Firebase Auth/Firestore/Storage/Hosting đã có cấu hình production; deployment chỉ chạy sau identity pre-flight.
- Cloud Run backend có `/health`, `/connectors/health`, transaction Content ID, publishing/manual fallback và retry policy.
- Workflows, Cloud Tasks, Scheduler và service-account bootstrap có script tái tạo.
- Tất cả connector bên ngoài mặc định `not_tested` + `manual`; không connector nào được tuyên bố PASS khi chưa có request thực tế.

## Chạy local

Yêu cầu Node.js 22+.

```powershell
npm.cmd install
npm.cmd run dev
npm.cmd run dev:backend
```

Khi chưa có Firebase config, Web App dùng dữ liệu demo cô lập trong trình duyệt và hiển thị cảnh báo rõ ràng. Sao chép `apps/web/.env.example` thành `.env.local` sau khi có Firebase Web App config chính thức. Không commit file môi trường.

## Kiểm thử

```powershell
npm.cmd run verify
firebase.cmd emulators:exec --project demo-ancv "npm.cmd run test"
```

## Triển khai

1. Chạy `scripts/identity-preflight.ps1`.
2. Chỉ tiếp tục khi Google/Firebase đều là `ancv.marketing@gmail.com`.
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

