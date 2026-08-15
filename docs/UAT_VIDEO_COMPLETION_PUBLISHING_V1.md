# UAT Video Completion & Publishing V1

Ngày kiểm tra: 2026-08-15  
Fixture: `ANCV-VID-2026-012` / `ANCV VIDEO COMPLETION PUBLISHING V1 TEST`

## Video Final

- Đăng ký local-first PASS: Firestore lưu `Projects/ANCV-VID-2026-012/Video Final/ANCV-VIDEO-COMPLETION-PUBLISHING-V1-TEST.mp4`.
- Metadata PASS: tên file, MIME type, 2,119,046 bytes và SHA-256; không lưu absolute path.
- Firebase Storage sau bước đăng ký Final: 0 object permanent.

## Platform copy

- TikTok, YouTube, Facebook, Zalo và LinkedIn: tạo đúng một bản/nền tảng và duyệt 5/5.
- Lần validation thiếu MASTER SCRIPT trả `SOURCE_CONTENT_REQUIRED` trước khi gọi OpenAI; không phát sinh usage.
- TikTok giữ đúng quy tắc một câu.

## YouTube PRIVATE

- OAuth refresh, ba scope yêu cầu, `channels.list(mine=true)` và Analytics request: PASS.
- Channel: `Giải Pháp An Ninh Cảnh Vệ` — `UCy-H7__UvdWcTbUax3RGDcA`.
- Job: `youtube-UWTHERwpR26mF2tr9S8j`.
- Kết quả: `succeeded`; Video ID `qY41dnPKxHg`; `privacyStatus=private`.
- Resumable upload tạo đúng một video; provider đọc lại metadata để xác minh channel và privacy.
- Staging cleanup PASS: 0 object còn lại dưới prefix của job.
- UI production hiển thị `Đã tải lên Riêng tư` và khóa nút upload để chống trùng.

### Lỗi phát hiện và sửa

Hai secret OAuth client cũ có trailing newline. Feasibility helper đã trim input nhưng Cloud Run provider chưa trim, khiến token exchange fail trước khi gửi request upload. Provider hiện chuẩn hóa whitespace cho Client ID, Client Secret, Refresh Token và expected Channel ID. Unit test bao phủ secret có CRLF/LF. Hai lần dừng trước đó đều không có Video ID và không chạm endpoint upload; job chỉ được resume sau khi chứng minh trạng thái an toàn.

## Manual social

- Facebook, TikTok, Zalo và LinkedIn: transition nội bộ `published` PASS trên fixture.
- Không mở nền tảng, không đăng bài thật và không lưu URL giả.
- UI hiển thị `Đã đăng` riêng cho bốn nền tảng; Content tổng hợp thành `published`.

## Safety

- Google Flow không Generate và không thay đổi runtime/profile.
- Không public, không schedule và không upload video lần hai.
- Không commit media, OAuth token, credential hoặc absolute local path.
