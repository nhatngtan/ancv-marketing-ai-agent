# Security

- Firestore/Storage deny-by-default, không có test/public mode.
- Role được đọc từ `users/{uid}`; client tự đăng ký chỉ có thể tạo trạng thái `viewer/pending`, không thể tự nâng quyền.
- `systemCounters` và health probes chỉ backend/service account truy cập.
- Cloud Run mặc định private; Workflows và automation service accounts nhận `roles/run.invoker` theo service.
- Secret production đặt trong Secret Manager; `.env*`, service account JSON và credential files bị Git ignore.
- Log HTTP redact `Authorization` và cookie. Lỗi trả thông báo chung, chi tiết ở Cloud Logging.
- Retry phân loại: auth/permission/validation không retry; rate limit/5xx có trần; không tạo vòng lặp Cloud Tasks.
- Không tự xử lý CAPTCHA, 2FA hoặc security verification. Flow Worker dừng an toàn khi UI không chắc chắn.
- Không dùng OAuth client, token, ADC hoặc browser session của dự án cũ.
- Không hard-code email development trong business logic. Role Admin lấy từ Firestore/IAM; runtime không dùng ADC cá nhân.
- OpenAI key production chỉ được gắn từ Secret Manager `openai-api-key`; thay key không cần sửa source.

- Cloud Run xác minh Firebase ID token (kể cả revocation) bằng Service Account production với `roles/firebaseauth.viewer`; không dùng credential cá nhân.
- Storage Rules đọc `users/{uid}` để kiểm tra role; Firebase Storage service agent chỉ được cấp `roles/firebaserules.firestoreServiceAgent` phục vụ cross-service rule evaluation.

## Báo cáo lỗ hổng

Không đưa credential vào issue hoặc log. Thu hồi/rotate secret trong đúng project ANCV, kiểm tra Cloud Audit Logs và khóa connector liên quan về `manual` cho tới khi test lại.
