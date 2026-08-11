# WordPress Connectivity Check — Read-only

Cập nhật: 2026-08-11.

## Phạm vi được phép

- `GET https://anninhcanhve.com/wp-json/`
- Authenticated `GET https://anninhcanhve.com/wp-json/wp/v2/users/me?context=edit`

Không gửi POST, PUT, PATCH hoặc DELETE. Không tạo/update/trash bài, không upload media và không publish trong khi Website đang xây dựng.

## Evidence hiện tại

- REST API root: PASS, HTTP 200.
- Namespace `wp/v2`: PASS.
- Application Password authentication được REST discovery quảng bá: PASS.
- Anonymous `/users/me`: HTTP 401 đúng dự kiến.
- `wordpress-username`: version enabled, giá trị `editor01`.
- `wordpress-application-password`: version enabled và mount qua Secret Manager.
- Authenticated `/users/me?context=edit`: PASS, HTTP 200 từ Cloud Run revision `ancv-marketing-backend-00021-zkt`.
- Authenticated user: `editor01`; API trả role `administrator`, khác với role `Editor` được cung cấp ban đầu. Không thay đổi role trong connectivity check.
- Read access: PASS.
- Write access: NOT TESTED.
- Media: NOT TESTED.
- Publishing: NOT TESTED.
- Connector mode: `semi_automatic` với Manual Fallback.

Backend feasibility runner cưỡng chế `method: GET`, chỉ gửi Basic Authorization tới đúng origin WordPress và không forward credential sang origin khác khi redirect. Unit test kiểm tra toàn bộ request của connectivity flow đều là GET.

Kết quả production đã lưu vào `connectors/website` và `connectorTests`, với `testedBy` là `ancv-automation@ancv-marketing-ai-agent.iam.gserviceaccount.com`. Credential không được lưu cùng evidence.
