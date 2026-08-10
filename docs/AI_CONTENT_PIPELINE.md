# AI Content Pipeline

## Nguyên tắc

`MASTER SCRIPT external → AI processing → Human edit/review → Human approval → Ready for distribution`.

AI không tạo MASTER SCRIPT và không tự publish. Social/WordPress connector vẫn độc lập với Content Studio.

## Video

1. Tạo Video, nhập/paste MASTER SCRIPT và lưu tự động.
2. Khai báo Visual Style/Character References nếu cần.
3. Người dùng bấm **Phân chia cảnh bằng AI**. Backend dùng Structured Output và validate trước khi batch-write `scenes`.
4. Scene Editor cho sửa, reorder, thêm, xóa, duplicate, regenerate một scene/prompt, copy prompt và duyệt.
5. Dùng Prompt Google Flow thủ công; upload nhiều Video Raw take và chọn take, không xóa take khác.
6. Đủ take thì chuyển **Chờ hậu kỳ**, tải TSV để handoff CapCut.
7. Upload/chọn Video Final, tạo riêng TikTok/YouTube/Facebook/Zalo/LinkedIn copy.
8. Chỉnh, lưu, duyệt; duyệt Content rồi chuyển **Sẵn sàng đăng**.

## Article

1. Tạo Article từ chủ đề và optional objective/emphasis/source/notes/length.
2. Người dùng chủ động bấm tạo Article Draft, tự chỉnh và autosave.
3. Người dùng chủ động nhập/chỉnh image prompt, size, quality; mặc định low. Ảnh được lưu Storage và metadata `mediaAssets`.
4. Tạo riêng Website/Facebook/Zalo/LinkedIn copy; không TikTok, Video, landing page hay keyword set.
5. Chọn ảnh chính, chỉnh/duyệt từng platform, duyệt Content rồi chuyển sẵn sàng đăng.
6. WordPress chưa auth vẫn dùng manual copy/upload/URL confirmation.

## Factual Safety

Prompt chỉ nhận dữ kiện từ input và `systemSettings/companyProfile`. Trường trống là chưa xác minh. AI bị cấm bịa năm thành lập, quy mô, khách hàng, chứng nhận, giải thưởng, địa điểm, phạm vi, giá, cam kết hoặc số liệu.

## Safe failure

OpenAI/Storage/job lỗi không xóa MASTER SCRIPT, Article Draft, scene/media cũ hay platform copy đã chỉnh. Regenerate toàn bộ cần xác nhận; regenerate một scene chạy độc lập. Google Flow và CapCut luôn thủ công trong 2B.
