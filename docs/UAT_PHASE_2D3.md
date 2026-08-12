# UAT Giai đoạn 2D.3 — Local Agent / Browser Bridge / Local-first

Ngày kiểm thử: 2026-08-12. Kết quả tổng: **PARTIAL**. Không chạy lại Generate.

## PASS

- Local Agent khởi động qua Windows Task Scheduler `ANCV Local Agent`; heartbeat `online`, workspace available.
- Browser Bridge Manifest V3 đăng ký qua nonce một lần và giao tiếp trên `127.0.0.1:32187`; profile `account-01` connected.
- Profile Manager tự mở dedicated profile, không dùng Chrome profile chính.
- Flow preflight read-only PASS: đúng project URL từ `flowAccounts/account-01`, Prompt/Video/Generate locator và `x1` đều xác định; baseline có 3 video preview.
- Web/backend tạo Firestore job với `executionMode=local_agent`, `storageStrategy=local_first`; Local Agent claim đúng một job.
- Generate intent ghi trước click; `generateClicks=1`.
- Fail-safe PASS: sau 15 phút không thấy output +1, job chuyển `needs_manual` với `FLOW_OUTPUT_TIMEOUT_NO_RETRY`; không Generate lần hai.
- Open-folder command PASS: Web/backend tạo `localCommands`, Local Agent resolve relative path và mở Explorer.
- Firebase Storage prefix của fixture có 0 object; không upload implicit.
- Production Web HTTP 200, backend health `ok`, Cloud Run revision `ancv-marketing-backend-00027-rct`.

## Smoke fixture

- Content: `ANCV-VID-2026-LOCALTEST-640916` / `jHmt0vScsltpVGcatDSP`, `status=test`, `testContent=true`.
- Scene / Job: `eO7MHCKWK5pZV1pa548F`.
- Job: `needs_manual`; Generate clicks: 1; local asset count: 0; Firebase upload count: 0.
- Open-folder command: `Yr0WL2FOKS24oGVc7dDa`, succeeded.

## Chưa PASS

- ONE SCENE local file/download/metadata không PASS vì Flow không làm tăng preview count trong timeout. Không có MP4 để download hoặc lưu local.
- Account email không hiện qua DOM locator của Flow; session vẫn được reuse từ dedicated profile đã preflight thành công. Không có account mismatch evidence, nhưng chưa có DOM email evidence mới.
- Profile switch test không chạy vì chưa có profile thứ hai được đăng ký an toàn làm Flow account.

## Kết luận

Architecture, runtime, UI, heartbeat, profile/bridge, job ownership, local-first metadata và fail-safe đã hoạt động. Tiêu chí end-to-end ONE SCENE chưa hoàn tất, vì vậy không đánh dấu Phase PASS và không gọi Flow automation là production-guaranteed. Playwright fallback và manual Copy Prompt/download local vẫn giữ nguyên.

## Diagnostic 2D.3A

Generation hiện hữu đã được kiểm tra read-only, không Generate thêm. Project vẫn có đúng 3 output cũ bằng baseline, không có output mới để recovery; job/scene giữ `needs_manual`, không có asset hoặc Firebase upload. Detection đã chuyển từ visible thumbnail count sang stable output ID và fail-closed khi baseline chưa ổn định. Evidence chi tiết: [FLOW_OUTPUT_RECOVERY_2D3A.md](FLOW_OUTPUT_RECOVERY_2D3A.md).
