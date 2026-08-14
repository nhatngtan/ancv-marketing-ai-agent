# UAT Flow Profile 44

Ngày kiểm tra: 2026-08-14
Phạm vi: Final UAT cho Google Flow Experimental, local-first, đúng một Scene.

## Mapping được chốt

- Chrome Profile: `Profile 44 — GOLD`
- Google account: `ashimigold@gmail.com`
- Flow Project: `46c51acb-8d28-418b-8a70-b6ab0c4207ba`
- Output: Video `x1`

Backend chụp `chromeProfileId`, email account và Flow Project URL vào từng Job mới. Worker từ chối chạy nếu Job, Flow account hoặc Browser Profile mapping không khớp. Runtime Chrome dùng profile thật đã map, không dùng profile mặc định và không tự đăng nhập Google.

## Job cũ

Job `IoayvPBRrZvZ3BXzDJET` không được retry và không Generate lần hai.

- Trạng thái cuối: `needs_manual`
- Generate clicks: `1`
- Recovery disposition: `no_output_keep_needs_manual`
- Close reason: `NO_RECOVERABLE_OUTPUT_OLD_PROJECT_UNAVAILABLE`
- Kết luận: generation thuộc Flow Project cũ không có output có thể recovery bằng mapping mới; Job được đóng an toàn.

## Flow E2E

Fixture production được đánh dấu TEST và chỉ có một Scene.

- Content ID: `ANCV-VID-2026-UAT-P44`
- Scene/Job: `uatP44FlowScene20260814`
- Generate: click đúng `1` lần
- Flow approval: click đúng `1` lần cho request đã tạo; không phải Generate lần hai
- Processing: được quan sát
- Output mới: đúng `1`
- Flow output ID: `b6b485f2-7377-4d03-aaea-b7f4ed83e666`
- Download: đúng `1` MP4, `2,448,157` bytes
- Storage: local-first
- Local relative path: `Projects/ANCV-VID-2026-UAT-P44/Video Raw/Scene-01/ANCV-VID-2026-UAT-P44_S01_T01.mp4`
- Firebase `mediaAssets`: đúng `1` record, gắn đúng Scene/Job
- Scene: `used`, Flow `succeeded`
- Job: `succeeded`
- Temporary download: đã cleanup sau khi copy/hash verification thành công
- UI test: PASS cho `Scene 01 — Take 01`, tên file và nhãn `Lưu trên máy`

Fixture Firestore và local MP4 được xóa sau khi evidence và UI test hoàn tất. Output test trên Google Flow được giữ nguyên; UAT không thực hiện thao tác xóa dữ liệu Flow.

## Root cause và reliability fix

Root cause của Job cũ là state được tạo trong Flow Project/profile trước đó nhưng hệ thống chưa khóa identity mapping vào Job. Khi mapping chuyển account/project, recovery không còn đủ bằng chứng để xác định output cũ mà không có nguy cơ Generate lại.

Các chốt an toàn đã bổ sung:

- Job mới chỉ được tạo khi mapping Google Flow có validation `ready_for_write_test`.
- Job lưu rõ Chrome Profile, Google account và Flow Project URL.
- Worker fail-closed khi account/project/profile không khớp.
- Local Agent khởi chạy Chrome thật bằng profile đã map.
- `generateIntentAt` được ghi trước click; `generateClicks` không vượt quá 1.
- Download local-first được kiểm tra MP4 signature, kích thước và SHA-256 trước khi ghi metadata.
- Asset dùng ID deterministic theo Flow Job để chống duplicate.
- Không retry Generate khi output không chắc chắn.

## UX simplification

Video workflow được gom về ba bước người dùng nhìn thấy:

1. Kịch bản
2. Tạo video theo từng Scene
3. Hoàn tất

Mỗi Scene hiển thị prompt, nút tạo một video, trạng thái Job và Video Raw ngay cùng ngữ cảnh. Tuỳ chọn upload Cloud được đặt trong khu vực nâng cao; đường chính ưu tiên local-first và mở file/thư mục qua Local Agent.

Google Flow tiếp tục mang nhãn **EXPERIMENTAL** và Manual Fallback vẫn là luồng chính thức khi session, credit, UI hoặc output không chắc chắn.
