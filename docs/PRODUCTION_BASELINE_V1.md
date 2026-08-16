# Production Baseline V1

Ngày chốt: 2026-08-16

## Baseline

- Runtime source commit: `a2c3d604d74062cda817c9ae673707ff2ec6c79f`.
- Release convention: SemVer; Production V1 closure dùng tag `v1.0.1`.
- Web production: <https://ancv-marketing-ai-agent.web.app/>.
- Cloud Run: service `ancv-marketing-backend`, revision `ancv-marketing-backend-00055-swp`.
- Firebase Rules: Firestore và Storage Rules production đã deploy; quyền truy cập theo role và mặc định từ chối ngoài phạm vi cho phép.
- Local Agent: `ancv-windows-01` hoạt động theo mô hình local-first.

## Capability baseline

- Google Flow: `AVAILABLE / EXPERIMENTAL`; manual fallback vẫn được giữ.
- YouTube: operational; upload API dùng chế độ Private và có idempotency.
- WordPress Draft: operational; chỉ tạo Draft khi người dùng chủ động xác nhận.
- Article SEO: operational.
- Reporting Dashboard: operational; fixture TEST không làm sai KPI vận hành.
- Facebook, TikTok, Zalo và LinkedIn: manual.
- GA4 và Search Console: chưa có property được cấp quyền cho hệ thống.

## Audit closure

`AUDIT-006 = ACCEPTED BY OWNER`

- WordPress API user `editor01` intentionally remains Administrator.
- Owner đã biết và chấp nhận rủi ro least-privilege.
- Không yêu cầu remediation thêm cho Production V1.

`FULL PRODUCTION AUDIT = STRICT PASS — ACCEPTED WORDPRESS ADMIN ROLE RISK`

## Accepted risks

- WordPress API user có quyền Administrator thay vì role tối thiểu.
- Google Flow là integration thử nghiệm, phụ thuộc giao diện bên ngoài và phiên đăng nhập managed profile.
- Facebook, TikTok, Zalo và LinkedIn chưa có API publishing production; hệ thống dùng manual fallback.
- GA4 và Search Console chưa thu thập dữ liệu vì chưa có property access.

