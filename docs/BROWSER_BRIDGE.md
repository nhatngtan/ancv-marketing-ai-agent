# ANCV Browser Bridge

Browser Bridge là Chrome Extension Manifest V3 tối thiểu tại `tools/flow-worker/extension`. Local Agent mở Chrome thật với dedicated `user-data-dir` và nạp extension; extension kết nối lại agent qua HTTP loopback.

## Security boundary

- Server chỉ bind `127.0.0.1`, không bind `0.0.0.0`, không expose LAN/Internet.
- Host permissions chỉ gồm `https://labs.google/*` và `http://127.0.0.1/*`.
- Đăng ký lần đầu dùng setup nonce một lần, hết hạn sau 60 giây; các request tiếp theo dùng bridge token ngẫu nhiên lưu trong machine config và `chrome.storage.local` của dedicated profile.
- Không đọc hoặc lưu password, cookie, OAuth token, lịch sử duyệt web hoặc dữ liệu từ tab ngoài Google Flow.
- Extension chỉ hỗ trợ tập lệnh hẹp: mở URL Flow, preflight, điền prompt, click Generate có locator duy nhất, mở output mới nhất và download.

## Profile isolation

Firestore chỉ biết logical ID như `account-01`. Mapping logical ID → local user-data-dir/email kỳ vọng nằm trong machine config ngoài Git. Mỗi lần chỉ một profile được mở; đổi profile sẽ đóng browser do agent quản lý trước.

## Kết nối lỗi

Nếu heartbeat/command timeout, Local Agent dừng job an toàn. Nếu Generate đã click, job không retry và chuyển xử lý thủ công. Browser Bridge không thực hiện Google login, CAPTCHA hay 2FA.
