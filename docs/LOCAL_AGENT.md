# ANCV Local Agent

ANCV Local Agent là runtime Windows cục bộ của hệ thống. Web App tạo job trong Firestore; agent nhận job, điều khiển đúng Chrome profile qua Browser Bridge và lưu media vào máy. Codex không phải runtime.

## Local-first

Workspace mặc định trên máy development là `D:\ANCV Marketing`. Video Flow được lưu theo cấu trúc:

`Projects/{ContentID}/Video Raw/Scene-{NN}/{ContentID}_S{NN}_T{TT}.mp4`

Firestore chỉ lưu metadata, trạng thái, relative path và audit fields. Firebase Storage chỉ dùng khi người dùng chủ động chọn upload Cloud hoặc nghiệp vụ khác bắt buộc.

## Cấu hình và vận hành

```powershell
npm.cmd run local:configure
npm.cmd run local:preflight -- account-01
npm.cmd run local:agent
```

Cấu hình máy và bridge token nằm ở `%LOCALAPPDATA%\ANCV\local-agent\config.json`, ngoài Git. Profile Flow hiện hữu nằm ở `%LOCALAPPDATA%\ANCV\flow-worker-data\account-01`; không dùng Chrome profile chính và không lưu password trong project.

Autostart:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/install-local-agent-autostart.ps1
```

Task Scheduler chỉ chạy một instance. Heartbeat được ghi vào `localAgents/ancv-windows-01`; UI coi heartbeat quá 45 giây là Offline.

## Fail-safe

- Một agent, một Chrome, một account, một Scene tại một thời điểm.
- Ghi `generateIntentAt` trước click; Generate tối đa một lần và không retry nếu kết quả không chắc chắn.
- Sai account/project, mất login, verification, locator mơ hồ, không phải `x1`, download lỗi hoặc bridge mất kết nối đều chuyển `needs_manual`.
- Sau UAT 2D.3C, Browser Bridge chỉ dùng cho Profile Manager, session, navigation và read-only inspection; Generate fail-closed vì CDP mouse không tạo acceptance signal. Job mới được route sang `playwright_fallback`; local-first storage strategy giữ nguyên.
- UAT 2D.4 đã chứng minh Dashboard → Local Agent → Playwright Generate đúng một lần và phát hiện đúng một output mới. Bước UI Download timeout, vì vậy trạng thái vẫn **EXPERIMENTAL / PARTIAL** và job chuyển `needs_manual`; xem [UAT_PHASE_2D4.md](UAT_PHASE_2D4.md).
- UAT 2D.4A recovery đã xác định viewport overlay là nguyên nhân Download timeout. Viewport 1440×900 + trusted locator click đã tạo đủ Playwright/CDP/filesystem evidence, lưu MP4 local và khôi phục Job/Scene `succeeded`; trạng thái **EXPERIMENTAL / AVAILABLE**. Xem [UAT_PHASE_2D4A.md](UAT_PHASE_2D4A.md).
- File tạm chỉ xóa sau khi copy, kích thước và SHA-256 đã được xác minh và metadata Firestore đã commit.

## Bàn giao

Khi đổi máy: cài Node/Chrome, clone repo, chạy `local:configure`, đăng nhập Flow bằng dedicated profile theo `docs/FLOW_WORKER.md`, cài autostart và chạy preflight. Không sao chép credential cá nhân vào repo.
