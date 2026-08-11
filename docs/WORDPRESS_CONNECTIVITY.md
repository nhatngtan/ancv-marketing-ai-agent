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
- `wordpress-application-password`: chưa có version enabled.
- Authenticated `/users/me`: NOT TESTED.
- Read access: chỉ public discovery PASS; authenticated read NOT TESTED.
- Write access: NOT TESTED.
- Media: NOT TESTED.
- Publishing: NOT TESTED.
- Connector mode: `semi_automatic` với Manual Fallback.

Backend feasibility runner cưỡng chế `method: GET`, chỉ gửi Basic Authorization tới đúng origin WordPress và không forward credential sang origin khác khi redirect. Unit test kiểm tra toàn bộ request của connectivity flow đều là GET.
