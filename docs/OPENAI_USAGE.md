# OpenAI Usage & Cost Protection

## Collections

- `aiJobs`: operation, content, idempotency key, status, attempt count, result metadata và lỗi đã redact.
- `aiUsage`: operation, model, input/output/total tokens, request ID và image count.
- `auditLogs`: actor/action/entity/timestamp; không lưu API key.

Operations: `scene_breakdown`, `scene_regeneration`, `flow_prompt`, `video_social_copy`, `article_generation`, `article_platform_copy`, `image_generation`, `report_analysis`.

## Controls

- Firebase `admin/editor` authentication bắt buộc cho generation.
- Client tạo UUID request; nút bị disable khi chạy. Server hash `user + operation + request ID`, duplicate success trả lại result; duplicate đang chạy trả 409.
- SDK retry tối đa 1; application job tối đa 1 attempt cho một idempotency key. Muốn thử lại lỗi phải tạo request ID mới.
- Rate limit mặc định 20 AI actions/user/10 phút, cấu hình tập trung.
- Regenerate toàn bộ scene và overwrite draft/copy cần confirmation. Một scene/prompt được regenerate riêng.
- Image default `1024x1024`, quality `low`; người dùng phải bấm tạo. Không tạo ảnh tự động sau Article.
- Model mapping tập trung ở `aiModelConfig`; key chỉ ở Secret Manager.

## Official OpenAI basis

Implementation dùng Responses API Structured Outputs với strict JSON Schema và validation bổ sung; Image API hỗ trợ size/quality/output format. Xem [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [Image generation](https://developers.openai.com/api/docs/guides/image-generation) và [GPT-5.6 Terra](https://developers.openai.com/api/docs/models/gpt-5.6-terra).

## Production smoke — Phase 2B

Ngày 2026-08-10, Cloud Run revision `ancv-marketing-backend-00017-59n` đã chạy production smoke bằng Firebase Admin thật:

- `scene_breakdown`: 2 scenes, đủ 11 trường structured; replay cùng idempotency key trả kết quả cũ và không tạo usage mới.
- `video_social_copy`: TikTok đúng một dòng.
- `article_generation`: Article ngắn thành công.
- `image_generation`: đúng 1 ảnh `gpt-image-2`, `1024x1024`, quality `low`; object 1.241.784 byte được lưu trong Firebase Storage và metadata khớp Firestore.
- Firestore có đúng 4 record `aiUsage` cho bốn operation; cả hai Content test được chuyển `archived` và giữ `testContent=true`.
