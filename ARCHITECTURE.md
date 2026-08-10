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

