# Phase 3 — Production Launch Readiness & Final UAT

Ngày kiểm tra: 2026-08-12. Project: `ancv-marketing-ai-agent`.

## Kết luận

**READY WITH NON-BLOCKING LIMITATIONS.** Core Web/Firebase/Cloud Run/Content Studio/Local Agent hoạt động; connector ngoài tiếp tục degrade gracefully. Không gọi OpenAI và không Generate Google Flow trong Final UAT.

## Production health

- Firebase Hosting `https://ancv-marketing-ai-agent.web.app`: HTTP 200; Firebase Google Auth đang đăng nhập bằng `nhat.ngtan@gmail.com`.
- Cloud Run `/health`: HTTP 200; revision `ancv-marketing-backend-00032-j4j`; runtime dùng `ancv-cloud-run@ancv-marketing-ai-agent.iam.gserviceaccount.com`; 100% traffic.
- Firestore và Storage hiển thị **Hoạt động** trên System Health. Cloud Run không có log `severity>=ERROR` trong 24 giờ kiểm tra.
- Task Scheduler `ANCV Local Agent` đã được stop/start theo cách ít gián đoạn; task trở lại Running, listener ở `127.0.0.1:32187`, heartbeat Firestore Online và workspace accessible.
- System Health vẫn mở bình thường khi Browser Bridge disconnected; GA4/GSC chưa có property và Social chưa cấu hình không làm Core fail.

## Video UAT

- Fixture `ANCV-VID-2026-004`: MASTER SCRIPT autosave/edit/load PASS và đã khôi phục nội dung gốc; 2 scene structured, Scene Editor, prompt copy, Flow account selector, 2 Raw take, chọn take và CapCut handoff khả dụng.
- 5 bản nền tảng được lưu riêng; TikTok là đúng 01 câu ngắn và đã duyệt. Không gọi OpenAI lại.
- Fixture Flow `ANCV-VID-2026-LOCALTEST-026989`: job/scene succeeded, đúng 01 MP4 local (2,119,046 bytes), đúng 01 `mediaAssets`, `storageType=local`, đường dẫn tương đối, không duplicate và lệnh mở thư mục scene PASS.
- Video Final vẫn là thao tác người dùng upload/chọn; pipeline đã PASS ở UAT 2C. Không chạy Flow Generate mới trong Phase 3.

## Article UAT

- Fixture `ANCV-ART-2026-001`: draft edit/autosave/load PASS và nội dung đã được khôi phục; factual safety không có số liệu/chứng nhận/cam kết ANCV chưa xác minh.
- Ảnh OpenAI low-quality đã có từ smoke 2B; không tạo ảnh mới.
- Website/Facebook/Zalo/LinkedIn được chỉnh, lưu và duyệt riêng qua Web production. Content đi qua `approved → ready_to_publish`, sau đó fixture được trả về `archived`.
- UAT phát hiện và sửa lỗi snapshot Firestore làm mất các bản nền tảng chưa lưu khi lưu một bản khác. Kiểm tra lại production: lưu Website vẫn giữ nguyên ba draft chưa lưu còn lại.
- WordPress chỉ read-only; không gửi POST/PUT/PATCH/DELETE.

## Cleanup

Đã xóa đúng hai failed LOCALTEST fixtures dư thừa cùng scene/job liên quan và một local command test cũ. Giữ ba fixture evidence: Phase 2B Video, Phase 2B Article và strict local-first Flow success; giữ connector evidence/configuration. Không xóa dữ liệu không chắc chắn.

Một thư mục fixture rỗng `D:\ANCV Marketing\Projects\ANCV-VID-2026-LOCALTEST-640916` được giữ lại vì thao tác xóa bị chính sách công cụ chặn; không chứa media và không ảnh hưởng vận hành.

## Security & tests

- Secret scan trên 128 file tracked: 0 private key/token/password/cookie match; `.env.local`, workspace, profile data, credentials JSON và `flow-worker-data` không tracked.
- OpenAI/YouTube/WordPress credential có version Secret Manager enabled; không đọc hoặc log secret value.
- API production anonymous: health 200; Content, AI và Flow protected endpoints đều 401.
- `npm run verify`: lint, TypeScript, build và 41 unit tests PASS. Firestore Rules emulator: 5/5 tests PASS.
- Firebase Hosting chỉ được deploy sau khi xác nhận Firebase CLI active account `nhat.ngtan@gmail.com` và project `ancv-marketing-ai-agent`.

## Non-blocking limitations

- Flow giữ nhãn Experimental và cần đăng nhập/profile thủ công khi session hết hạn.
- Browser Bridge có thể disconnected khi không mở profile; manual Flow fallback vẫn dùng được.
- Video Final/manual Raw upload cũ vẫn dùng Firebase Storage; strict Flow output mới là local-first. Chưa migrate asset cũ vì không phải launch blocker.
- GA4/GSC chưa có property; Facebook/TikTok/LinkedIn/Zalo chưa cấu hình; WordPress write chưa test và chưa bật.
- Bundle Web có cảnh báo kích thước chunk >500 kB nhưng build/load production PASS; chưa refactor vì không phải blocker.
