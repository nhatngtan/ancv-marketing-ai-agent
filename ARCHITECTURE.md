# Kiến trúc

## Nguyên tắc

`Web App → Firebase → Google Cloud → Connector Layer → API / AI / Automation / Manual Fallback`

Core chỉ phụ thuộc Firebase và backend nội bộ. Dashboard đọc snapshot đã lưu trong Firestore, không gọi realtime tới mạng xã hội. Publishing và analytics được tách theo platform; một job thất bại không rollback job đã thành công.

## Thành phần

- **Web App:** giao diện Marketing Leader, Firebase Google Sign-in, Content CRUD, trạng thái per-platform và manual completion.
- **Firebase:** Authentication, Firestore, Storage, Hosting. Security Rules deny-by-default và role `admin/editor/viewer`.
- **Cloud Run:** API module hóa thành Content, AI, Publishing, Analytics/Connector, Reporting/Scheduler.
- **Workflows:** điều phối fan-out. `publish-content` bắt lỗi từng platform và trả kết quả tổng hợp.
- **Cloud Tasks:** hàng đợi `ancv-jobs`, tối đa 3 attempts ở queue; ứng dụng dừng ngay cho auth/permission/validation.
- **Scheduler:** chỉ dispatcher analytics cho connector có trạng thái `available`/`partially_available`.
- **Secret Manager:** chứa secret production. Không đưa secret xuống Web App ngoài Firebase public config.

## Mô hình failure

| Failure | Hành vi |
| --- | --- |
| Auth/permission | Không retry; `needs_action`; gợi ý manual fallback |
| Rate limit | Backoff có giới hạn, tối đa 3 attempts |
| 5xx/timeout | Tối đa 2 attempts |
| Connector chưa test | Provider manual; không gửi request ngoài |
| Một platform lỗi | Giữ nguyên kết quả platform khác; Content có thể `partially_published` |
| Analytics lỗi | Giữ dữ liệu lịch sử và timestamp; Dashboard không crash |
| Flow lỗi | `Cần xử lý thủ công`; cho upload Video Raw |

## Content ID

Backend dùng Firestore transaction trên `systemCounters/{type}-{year}` để sinh `ANCV-VID-YYYY-XXX` và `ANCV-ART-YYYY-XXX`; Rules chặn client truy cập counter nhằm chống trùng và giả mạo sequence.

## AI Content Studio

- `contents`: nguồn sự thật của Video/Article, MASTER SCRIPT, Article Draft, visual continuity, platform copies và approval state.
- `scenes`: scene có cấu trúc, độc lập để thêm/xóa/duplicate/reorder/regenerate một scene.
- `mediaAssets`: Video Raw takes, Video Final và ảnh Article; binary nằm ở Cloud Storage.
- `aiJobs`: idempotency và trạng thái `queued/processing/succeeded/failed`; tối đa một application attempt cho cùng request ID.
- `aiUsage`: operation, model, request ID và token/image usage để tổng hợp theo tháng.
- `auditLogs`: generate/regenerate/approve/upload/manual publish với actor và timestamp.
- `systemSettings/companyProfile`: dữ liệu Công ty đã xác minh được phép đưa vào prompt.

AI endpoints yêu cầu Firebase `admin/editor`. Structured output được OpenAI ràng buộc JSON Schema và backend tiếp tục validate bằng Zod trước khi ghi production collections. Image bytes được upload vào Storage ngay; ứng dụng không phụ thuộc URL tạm của provider.

`MASTER SCRIPT external → AI processing → Human edit/review → Human approval → Ready for distribution`. Không endpoint Giai đoạn 2B nào tự publish social/WordPress.

Flow runtime experimental theo local-first: Web App tạo `flowJobs` trong Firestore → ANCV Local Agent trên Windows → ANCV Browser Bridge loopback → dedicated Chrome profile → Google Flow → local workspace. Firestore chỉ giữ metadata/state; Video Raw mặc định không upload Cloud. Playwright CDP Worker V1 vẫn được giữ làm fallback riêng. Cả hai đều generate tối đa một lần và degrade về Copy Prompt + upload thủ công.
