# UAT Phase 2C

Ngày kiểm tra: 2026-08-11. Môi trường: Firebase/Cloud Run production, tài khoản `nhat.ngtan@gmail.com` có role Admin.

## Kết quả

- Video PASS: lưu MASTER SCRIPT, đọc 2 scene có đủ prompt/continuity, upload 2 Raw take, chọn take, chuyển Chờ hậu kỳ, upload/chọn Video Final, lưu và duyệt 5 bản nền tảng, duyệt Content và chuyển Sẵn sàng đăng.
- Article PASS: chỉnh Article Draft, chọn ảnh AI đã tồn tại, lưu và duyệt Website/Facebook/Zalo/LinkedIn, duyệt Content và chuyển Sẵn sàng đăng.
- Security PASS: các thao tác dùng Firebase client thật nên chịu Firestore Rules và Storage Rules; backend xác minh Firebase ID token thật.
- Audit PASS: có `content.upload_raw`, `content.upload_final`, `content.select_asset`, `content.status`, `content.approve`, `content.ready_to_publish`.
- Chi phí AI: 0 request OpenAI; không tạo ảnh/video AI mới.
- Cleanup PASS: xóa 3 media fixture và khôi phục nguyên trạng 2 Content test Phase 2B.

## Lỗi phát hiện và đã sửa

Upload Video Raw ban đầu bị Storage Rules trả 403 dù Firestore role hợp lệ. Nguyên nhân là Firebase Storage service agent chưa có quyền đọc Firestore phục vụ `firestore.get()` trong cross-service Rules. Đã cấp `roles/firebaserules.firestoreServiceAgent` cho `service-645264934987@gcp-sa-firebasestorage.iam.gserviceaccount.com` và bổ sung cấu hình tái tạo vào `scripts/bootstrap-gcp.ps1`. UAT lại đã PASS.

## Connector chưa đủ quyền

- WordPress: hai Secret Manager container tồn tại nhưng chưa có version enabled; không chạy auth/media/draft/write test.
- GA4: Service Account authentication/list PASS, số property truy cập được = 0; không chạy `runReport`, không xây collector.
- Search Console: Service Account authentication/list PASS, số property truy cập được = 0; không chạy `searchAnalytics.query`, không xây collector.

Các connector trên tiếp tục safe/manual mode; Core Content Studio không bị ảnh hưởng.
