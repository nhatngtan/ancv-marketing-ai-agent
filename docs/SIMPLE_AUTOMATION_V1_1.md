# Simple Automation V1.1

Ngày xác minh: 2026-08-19.

## Luồng người dùng

- Video: Tạo → Hậu kỳ → hệ thống tự nhận Video Final → Duyệt → Đăng/Lên lịch.
- Article: Tạo → Duyệt → Đăng/Lên lịch.
- Facebook/TikTok/Zalo/LinkedIn: Chuẩn bị đăng → Đã đăng.

Giao diện không hỏi channel, privacy, API option, Job ID, Storage path hoặc OAuth.

## Auto Final

Local Agent theo dõi `Projects/<CONTENT>/Video Final` trong workspace local. File phải có định dạng cho phép, đủ lớn, MP4 có chữ ký hợp lệ và ổn định ít nhất 10 giây. Một file được tự đăng ký/chọn; nhiều file chỉ ghi danh sách để người dùng chọn. Asset ID dùng Content document ID và checksum nên lượt quét lặp không tạo duplicate.

UAT thật dùng một MP4 2,524,190 byte: tự đăng ký đúng một asset local, đúng relative path, chuyển Content sang `awaiting_copy`; lượt quét tiếp theo vẫn đúng một asset. Fixture Firestore và file local đã được cleanup.

## YouTube và WordPress

- Chỉ hiện **Đăng / Lên lịch** khi Content, copy/SEO và media đã đủ điều kiện.
- Mỗi hành động có xác nhận ngắn, nút bị khóa khi đang xử lý và backend dùng job ID deterministic.
- YouTube kiểm tra channel cố định, trạng thái privacy/schedule và video ID sau API; trạng thái không chắc chắn chuyển manual, không tự retry.
- WordPress tái sử dụng Post/Draft có marker ANCV, không tạo Post thứ hai; verify site, Post ID, status và thời gian schedule sau update.
- Không sửa Yoast, plugin hoặc WordPress config.

Automated tests và external write UAT do Owner phê duyệt đã PASS:

- YouTube: OAuth tối thiểu `youtube.force-ssl` + `yt-analytics.readonly`; cleanup fixture cũ PASS; đúng một video TEST được upload `private`, schedule xa, xác minh đúng channel/privacy/publishAt, rồi DELETE và read-back xác nhận không còn video hoặc nguy cơ tự public. Không retry và không có thời điểm public.
- WordPress: đúng một Post TEST `804` được tạo ở trạng thái `future`, schedule `2026-10-18T12:52:23.681Z`, đúng site/title/slug và không duplicate; sau verify Post được DELETE, read-back xác nhận Post/slug không còn và không có nguy cơ tự publish. Không có thời điểm public.

Kết luận: **SIMPLE AUTOMATION V1.1 = PASS**. Public production thật vẫn luôn cần người dùng chủ động duyệt/xác nhận.

## Manual Social

**Chuẩn bị đăng** chỉ sao chép caption đã duyệt, mở nền tảng và mở đúng Video Final/ảnh chính. **Đã đăng** chấp nhận URL để trống. Không Social API, Playwright hoặc thao tác post tự động.

## Báo cáo tuần

Báo cáo đọc Firestore và YouTube Analytics thật; GA4/Search Console thiếu property được ghi là nguồn thiếu, không tạo số giả. Dashboard chỉ hiển thị công việc có hành động và tối đa ba ưu tiên.

UAT read-only tuần 2026-08-13 đến 2026-08-19: 1 Video hoàn thành, 1 Article hoàn thành, 3 Content cần xử lý; YouTube kết nối và trả dữ liệu thật. Không có external write.
