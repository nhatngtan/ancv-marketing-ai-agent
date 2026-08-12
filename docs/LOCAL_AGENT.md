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
- Playwright CDP Worker cũ vẫn là fallback; agent mới không lấy job `playwright_fallback` và fallback cũ không lấy job `local_agent`.
- File tạm chỉ xóa sau khi copy, kích thước và SHA-256 đã được xác minh và metadata Firestore đã commit.

## Bàn giao

Khi đổi máy: cài Node/Chrome, clone repo, chạy `local:configure`, đăng nhập Flow bằng dedicated profile theo `docs/FLOW_WORKER.md`, cài autostart và chạy preflight. Không sao chép credential cá nhân vào repo.
