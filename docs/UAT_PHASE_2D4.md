# UAT GIAI ĐOẠN 2D.4 — HYBRID FLOW EXECUTION

Ngày kiểm tra: 2026-08-12  
Kết quả: **PARTIAL**

## Dashboard và routing

- Job được tạo từ Web Dashboard production, không tạo bằng script.
- Content: `ANCV-VID-2026-LOCALTEST-026989` (TEST).
- Scene/Job: `MnjlRelsDL2zkWmIDClC`.
- Logical account: `account-01` — expected `nhat.nt142@gmail.com`.
- Flow project: `b242cebe-fb9a-464a-8aeb-802b669a4a2e`.
- Local Agent: online, workspace `D:\ANCV Marketing` available.
- Execution mode/engine: `playwright_fallback`.
- Storage strategy: `local_first`.
- Browser Bridge Generate: disabled và không được gọi.

## Generate fail-safe

- Pre-flight: session ready, prompt/Video/Generate nhận diện được, output `x1` được xác nhận.
- `generateIntentAt`: `2026-08-12T06:11:45.052Z`.
- Baseline output IDs:
  - `22def277-65fc-4c9a-a306-046140b3b5fa`
  - `d175dd74-47cc-40a6-b01d-c65fe18dbd8a`
  - `2b96f8c1-6a93-4858-b3d1-262f4058c821`
- Generate clicks: `1`.
- Input method: `playwright`.
- New output ID: `334ab6c9-adad-4cef-a827-bd6824374484`.
- Số output mới: `1`.
- Không Generate lần hai. Các lượt recovery chỉ đọc/tải output đã có và giữ nguyên `generateIntentAt`.

## Download và local-first

- Output mới mở được bằng persisted `flowDetailId`, kể cả khi grid Flow lazy-load trả `outputCount=0`.
- Nút UI `Tải xuống` được nhận diện.
- Chrome không tạo file trong download directory sau timeout giới hạn 60 giây.
- Lỗi cuối: `FLOW_DOWNLOAD_UI_TIMEOUT`.
- Không dùng private Flow API để workaround.
- Local MP4: `0`.
- Firestore `mediaAssets`: `0`.
- Firebase Storage objects: `0`.
- Temporary download files: `0`.

## Trạng thái cuối

- Scene: `needs_manual`.
- Job: `needs_manual`.
- Duplicate asset: `0`.
- Dashboard hiển thị lỗi an toàn và vẫn hoạt động.
- Google Flow giữ trạng thái `EXPERIMENTAL / PARTIAL`; chưa chuyển `AVAILABLE`.

## Thay đổi tối thiểu

- Local Agent nhận deterministic job `playwright_fallback` và gọi Playwright worker hiện có.
- Local-first metadata chuẩn bị `executionEngine`, `outputId`, `fileSize`, `mimeType`.
- Recovery ưu tiên persisted `flowDetailId` và mở trực tiếp đúng output khi grid bị lazy-load.
- Download dùng UI Chrome với thư mục download local được giới hạn; timeout không retry.
- Web Dashboard thêm null-safety cho Content cũ thiếu `platforms`, tránh crash production.

Không bắt đầu phase tiếp theo và không đóng development Google Flow vì strict pass chưa đạt.
