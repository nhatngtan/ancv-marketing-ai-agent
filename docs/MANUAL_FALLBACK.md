# Manual Fallback

Manual posting là chế độ vận hành chính thức, không phải system error.

1. Hệ thống chuẩn bị media, tiêu đề, mô tả ngắn/dài và Content có thể copy.
2. Người dùng tải file cần upload và mở platform ngoài hệ thống.
3. Sau khi đăng, chọn **Đã đăng thủ công**.
4. Nhập URL bài đăng; tùy chọn Platform Post ID, thời gian và ghi chú.
5. Job platform chuyển `published`; các platform khác giữ trạng thái độc lập.
6. Content tổng thể là `partially_published` nếu mới một phần hoàn tất.

Flow Worker thất bại chuyển job `Cần xử lý thủ công`. Người dùng upload Video Raw; sau CapCut upload Video Final và pipeline tiếp tục. CAPTCHA, re-login, 2FA, account warning hoặc UI không xác định đều dừng worker, không click tiếp.

