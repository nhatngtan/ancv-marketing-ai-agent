# UAT GIAI ĐOẠN 2D.4A — FLOW DOWNLOAD RECOVERY

Ngày kiểm tra: 2026-08-12

Kết quả: **STRICT PASS**

## Output recovery

- Job/Scene: `MnjlRelsDL2zkWmIDClC`.
- Existing output: `334ab6c9-adad-4cef-a827-bd6824374484`.
- Account: `account-01` — `nhat.nt142@gmail.com`.
- Project: `b242cebe-fb9a-464a-8aeb-802b669a4a2e`.
- Output được mở trực tiếp bằng stable `/edit/<outputId>`.
- Generate performed: `false`.
- `generateClicks` vẫn là `1`; `generateIntentAt` không thay đổi.

## Download evidence

- Root cause: viewport 930px làm media viewport overlay chặn pointer tại tâm nút Download.
- Fix: viewport `1440x900`, re-resolve locator, trusted `locator.click()` không `force`.
- UI path: output detail → `downloadTải xuống`.
- Locator: `download-button`, visible/enabled/reachable.
- Playwright download event: PASS.
- CDP `downloadWillBegin`: PASS.
- CDP progress: `completed`, `2,119,046` bytes.
- Filesystem: đúng một MP4, không còn `.crdownload`.
- Console error: `0`.
- Không dùng private/undocumented Flow API.

## Local-first

- Final file: `D:\ANCV Marketing\Projects\ANCV-VID-2026-LOCALTEST-026989\Video Raw\Scene-01\ANCV-VID-2026-LOCALTEST-026989_S01_T01.mp4`.
- MP4 signature: `ftyp`.
- File size: `2,119,046` bytes.
- Firestore asset: `flow-MnjlRelsDL2zkWmIDClC`.
- `storageType=local`, `takeNumber=1`, `executionEngine=playwright_fallback`.
- `outputId=334ab6c9-adad-4cef-a827-bd6824374484`.
- Firebase Storage objects: `0`.
- Duplicate assets: `0`.
- Job/Scene: `succeeded`.
- Job temp file đã xóa sau copy/hash/Firestore commit.
- Dashboard hiển thị `Media (1)`, Take 1, Storage `Local` và Flow status `Thành công`.
- Lệnh `Mở thư mục Scene`: PASS; Local Agent command `tn6uNWU3iNggSVddzvAL` hoàn tất `succeeded` và Explorer mở đúng thư mục Scene-01.

Google Flow hybrid pipeline: **EXPERIMENTAL / AVAILABLE**.

`GOOGLE FLOW DEVELOPMENT CLOSED FOR NOW`
