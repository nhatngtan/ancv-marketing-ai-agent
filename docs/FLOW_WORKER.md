# Google Flow Worker — Experimental V1

Worker chỉ xử lý một Scene/lần, một Chrome/profile/lần. Không batch, parallel, retry Generate, tự đổi account, nhập password, vượt CAPTCHA/2FA hoặc tự động hóa CapCut.

## Kiến trúc đăng nhập an toàn

```text
Chrome thật + dedicated profile + đăng nhập thủ công
→ đóng Chrome
→ Chrome thật mở lại với CDP chỉ trên 127.0.0.1
→ Playwright attach sau khi đã đăng nhập
```

Không dùng Playwright để điều khiển lần đăng nhập Google đầu tiên. Không stealth, giả user-agent, fingerprint spoofing hay custom Chromium. Mỗi account dùng một profile riêng bên ngoài repository:

```text
%LOCALAPPDATA%\ANCV\flow-worker-data\account-01
%LOCALAPPDATA%\ANCV\flow-worker-data\account-02
```

Password, cookie và token không được ghi vào Firestore, Git, Secret Manager hoặc log.

## Đăng nhập lần đầu

```powershell
npm run flow:login -- account-01
```

Lệnh chỉ mở Google Chrome thật với `--user-data-dir` riêng; không bật CDP và không dùng Playwright. Người dùng tự đăng nhập, tự xử lý 2FA/verification, mở một Flow Project, không bấm Generate, rồi đóng toàn bộ cửa sổ Chrome của profile đó.

## Pre-flight

Sau khi Chrome đăng nhập đã đóng:

```powershell
npm run flow:preflight -- account-01
```

Command mở lại Chrome thật bằng cùng profile với remote debugging động chỉ bind `127.0.0.1`, rồi Playwright `connectOverCDP`. Pre-flight chỉ kiểm tra session, project, prompt, Video và Generate; tuyệt đối không Generate. Nếu session hết hạn hoặc Google yêu cầu verification, account chuyển về cần đăng nhập/xác minh.

Pre-flight còn bắt buộc chọn Video và xác nhận `x1`. Nếu Flow vẫn ở `x2` hoặc không xác định chắc chắn output count, account không được đánh dấu ready và Worker không được Generate.

## Chạy worker

```powershell
npm run flow:worker
```

Worker polling `flowJobs`, claim tuần tự và chỉ bấm Generate đúng một lần sau khi pre-flight PASS. Nếu Worker restart khi job đang xử lý, job chuyển `needs_manual`; không Generate lại.

Download ưu tiên nút **Tải xuống**. Nếu Chrome/Flow không phát Playwright download event, Worker dùng authenticated GET trong chính BrowserContext để đọc media đã tạo; cookie/URL media không được log. File được kiểm tra content type/kích thước trước khi upload Firebase Storage.

Trong Scene Editor: chọn **Tài khoản Google Flow** → **Tạo bằng Google Flow**. Manual fallback luôn còn: **Copy Prompt** → tạo video thủ công trong Flow → **Upload Video Raw**.

## Fail-safe

CAPTCHA, 2FA, account mismatch, locator không chắc chắn, UI thay đổi, timeout hoặc download lỗi đều dừng an toàn. Screenshot lỗi chỉ lưu cục bộ trong `flow-worker-data\errors`. File đã download nhưng upload lỗi được giữ trong `flow-worker-data\downloads`.

## Evidence ngày 2026-08-11

- Real Chrome login + dedicated profile + CDP localhost: PASS.
- Session reuse, Flow project, prompt, Video, Generate locator: PASS; pre-flight không Generate.
- Một lần click Generate cho Scene TEST số 1: PASS về idempotency (`generateIntentAt` chỉ có một timestamp).
- Flow ban đầu để mặc định `x2`, nên lần smoke đầu sinh hai biến thể dù chỉ click một lần. Worker đã được sửa bắt buộc `x1`; không chạy thêm Generate để tránh chi phí.
- Một biến thể được tải bằng authenticated media fallback, upload Firebase Storage và gắn đúng Scene: PASS, 2,190,565 bytes, một `mediaAssets` record.
- Theo tiêu chí nghiêm ngặt “một video duy nhất”, smoke này được ghi **PARTIAL**; cần một smoke được phê duyệt riêng trong tương lai để tái xác nhận `x1` bằng output thật.

Tham chiếu: [Google Flow Help](https://support.google.com/flow/answer/16353334), [Playwright connectOverCDP](https://playwright.dev/docs/api/class-browsertype#browser-type-connect-over-cdp), [Playwright downloads](https://playwright.dev/docs/api/class-download).
