# Article SEO Workflow V1

Luồng production:

`Chủ đề → Article Website canonical → ảnh AI → duyệt Article → Facebook/Zalo/LinkedIn → WordPress Draft`.

## Article Website canonical

- Input tối thiểu là chủ đề; mục tiêu/yêu cầu bổ sung và focus keyword là tùy chọn.
- Nếu focus keyword trống, AI chỉ suy ra một keyword phù hợp.
- OpenAI Responses Structured Output trả riêng `seoTitle`, `h1`, `slug`, `metaDescription`, `focusKeyword`, `body`, internal-link suggestions, FAQ và alt-text suggestions.
- Factual Safety chỉ cho phép dùng input người dùng, Company Profile và dữ liệu đã xác minh.
- Social copy luôn lấy Article Website đã lưu làm nguồn; không sinh thêm một Website copy trùng lặp.

## Quality gate

Checklist deterministic kiểm tra SEO Title, Meta Description, H1, H2/H3, focus keyword, mật độ keyword tự nhiên, CTA, alt text ảnh chính và slug. Đây không phải điểm SEO và không cam kết thứ hạng tìm kiếm.

Article chỉ được duyệt khi toàn bộ gate bắt buộc đạt. Ảnh chính phải có alt text mô tả ảnh; caption và media title là tùy chọn.

## WordPress boundary

Sau WordPress Draft UAT, UI cho phép đúng Article TEST đã duyệt tạo một draft. Thành công sẽ lưu Post/Media ID vào Content, hiển thị `Bản nháp WordPress đã tạo` và khóa nút tạo trùng.

Endpoint V1 chỉ tạo `status=draft`, không publish/schedule và không sửa plugin/role/config. Job ID, media slug và content marker là deterministic; timeout chỉ lookup/recovery, không create lần hai.

Draft chỉ nhận Article đã duyệt + ảnh chính có alt text + SEO gate đạt. Yoast chỉ được sync khi live POST schema expose field writable; hiện tại là `NOT_SYNCED_TO_YOAST`.
