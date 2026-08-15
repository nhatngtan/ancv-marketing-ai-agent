# UAT — WordPress Draft V1

Ngày: 2026-08-15  
Article: `ANCV-ART-2026-002`  
Site: `https://anninhcanhve.com`  
Backend revision: `ancv-marketing-backend-00049-9rm`

## Kết quả live

- Dashboard production tạo đúng một draft sau confirmation.
- WordPress Post ID: `801`.
- Status: `draft`; không publish, không schedule.
- Slug: `tieu-chi-lua-chon-dich-vu-bao-ve-doanh-nghiep`.
- Title: `Tiêu chí lựa chọn dịch vụ bảo vệ doanh nghiệp phù hợp vận hành`.
- Excerpt: Meta Description đã duyệt.
- Canonical body chứa marker `ANCV-CONTENT-ID:ANCV-ART-2026-002` để lookup/recovery.
- Featured Media ID: `800`.
- Media slug: `ancv-art-2026-002-featured-image`.
- Alt text: `Nhân sự doanh nghiệp cùng rà soát sơ đồ khu vực cần kiểm soát an ninh`.
- Lookup sau create: đúng `1` post sở hữu marker và đúng `1` total slug match.
- Dashboard lưu Post/Media ID, hiện `Bản nháp WordPress đã tạo · Post #801` và khóa nút tạo trùng.

## Idempotency và failure safety

- Job ID cố định: `wordpress-draft-MMS4vvs9ud1G73kbgt2S`.
- Media intent và post intent được ghi trước external write.
- Trước create luôn lookup slug; timeout/response không chắc chắn chỉ recovery bằng GET, không POST lần hai.
- Media dùng slug cố định và được tái sử dụng khi recovery; không upload duplicate.
- Job cuối: `succeeded`, `error=null`.

## Yoast

Live POST schema không expose field Yoast writable. `yoast_head` và `yoast_head_json` chỉ là response fields, không được gửi vào write payload.

Kết quả: `NOT_SYNCED_TO_YOAST`. SEO Title/Meta Description tiếp tục được giữ trong ANCV Dashboard; không sửa plugin, database hoặc WordPress config.

## Safety

- WordPress user/password/role không thay đổi.
- Facebook/Zalo/LinkedIn write: `0`.
- Google Flow Generate: `0`.
- YouTube upload: `0`.
- Draft được giữ lại để kiểm tra thủ công; không xóa/trash.

Kết luận: `WORDPRESS DRAFT UAT = PASS`.

