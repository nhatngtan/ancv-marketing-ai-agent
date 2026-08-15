# Video Completion & Publishing V1

Luồng production sau Google Flow:

`Video Raw → CapCut thủ công → Video Final local → AI Copy → duyệt → YouTube private / bàn giao thủ công`

## Video Final local-first

- Export từ CapCut vào `Projects/<Content ID>/Video Final/` trong workspace ANCV.
- Local Agent quét và đăng ký file; Firestore chỉ lưu relative path, tên, loại, kích thước và SHA-256.
- Không tạo Firebase Storage object khi đăng ký Final.
- Upload Cloud cũ chỉ còn trong mục tùy chọn nâng cao để tương thích dữ liệu cũ.

## Nội dung nền tảng

CTA `Tạo nội dung 5 nền tảng` gọi tuần tự endpoint AI hiện có cho TikTok, YouTube, Facebook, Zalo và LinkedIn. Bản đã tồn tại không bị ghi đè. Lỗi một nền tảng không xóa bốn kết quả còn lại. TikTok vẫn bị validate đúng một câu.

## YouTube V1

- Provider riêng xác minh OAuth channel chính xác `UCy-H7__UvdWcTbUax3RGDcA` trước upload.
- Chỉ cho phép `privacyStatus=private`.
- Điều kiện: Final local, bản YouTube đã duyệt, Content đã duyệt và xác nhận rõ trên UI.
- Job ID cố định theo Content để chống upload trùng.
- Local Agent staging tạm Final vào Firebase Storage; backend dùng resumable upload, xác minh video/channel/privacy rồi xóa staging.
- Không retry khi kết quả upload không chắc chắn.

## Manual handoff

Facebook, TikTok, Zalo và LinkedIn chỉ có Copy, mở nền tảng và `Đánh dấu đã đăng`. URL bài đăng là tùy chọn. Không API, Browser Agent hay Playwright trong V1.

## Google Flow

Google Flow được freeze trong phase này. Không thay đổi profile, CDP, Generate, detection hay download state machine; không Generate video để test luồng completion.
