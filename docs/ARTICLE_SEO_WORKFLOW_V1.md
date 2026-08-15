# Article SEO Workflow V1

Luồng production:

`Chủ đề → Article Website canonical → ảnh AI → duyệt Article → Facebook/Zalo/LinkedIn → WordPress Draft (chờ UAT write)`.

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

Hiện UI chỉ hiển thị nút `Tạo bản nháp WordPress` ở trạng thái disabled. Preflight chỉ gửi GET để kiểm tra REST root, authenticated user, capability và schema/SEO REST fields.

Không có endpoint WordPress write được bật trong V1 trước xác nhận UAT. Không có request POST/PUT/PATCH/DELETE, không publish và không sửa plugin/role/config.

Khi được phê duyệt cho UAT write, draft phải dùng idempotency ID theo Article, chỉ nhận Article đã duyệt + ảnh chính có alt text + SEO gate đạt, và luôn gửi `status=draft`.

