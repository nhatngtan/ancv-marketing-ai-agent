# UAT Flow Profile 44

Ngày kiểm tra: 2026-08-14 đến 2026-08-15
Phạm vi: Final UAT cho Google Flow Experimental, local-first, đúng một Scene.

> **KẾT LUẬN CUỐI: E2E PASS 3/3 — AVAILABLE / EXPERIMENTAL.** Ba lần độc lập đều bắt đầu từ nút `Tạo video` trên Production Web và hoàn tất tự động đến Video Raw local-first, không có thao tác Chrome thủ công, không retry và không Generate lần hai. Manual Fallback vẫn bắt buộc vì Flow là dịch vụ ngoài và UI/session/credit có thể thay đổi.

## Mapping cũ đã bị loại khỏi Flow runtime

- System Chrome Profile từng dùng: `Profile 44 — GOLD` — chỉ giữ làm evidence, không dùng để Generate
- Google account: `ashimigold@gmail.com`
- Flow Project: `46c51acb-8d28-418b-8a70-b6ab0c4207ba`
- Output: Video `x1`

Runtime hiện tại là ANCV managed profile `flow-gold` tại non-default user-data-dir `%LOCALAPPDATA%\ANCV\flow-profiles\gold`. Job snapshot `managedProfileId`, expected account và Flow Project URL. Backend/Worker từ chối system profile và fail-closed khi account/project/profile không khớp.

## READ-ONLY preflight managed profile

- Profile: `flow-gold` (`kind: managed`)
- CDP localhost attach: PASS
- URL đích: đúng Project `46c51acb-8d28-418b-8a70-b6ab0c4207ba`
- Session: authenticated
- Account verified: `ashimigold@gmail.com` qua tab Google Account read-only
- Project: PASS
- Prompt / Video / x1 / Generate locator: PASS, Generate locator unique trong Prompt Composer
- Approval/confirmation: không xuất hiện trong ba E2E production
- Generate: `0`
- Kết luận preflight: `READY_FOR_E2E = YES`; không Generate trong preflight.

## Production E2E 3/3

| Lần | Job / Scene | Generate | Retry | Output | MP4 local | Asset | UI Raw | Chrome thủ công |
| --- | --- | ---: | ---: | --- | ---: | --- | --- | ---: |
| 1/3 | `c8wMd9r7mIh9B2USHi2T` | 1 | 0 | `7bafc997-8bb4-4781-8f41-e9c79a3ccaba` | 2,654,445 bytes | `flow-c8wMd9r7mIh9B2USHi2T` | PASS | 0 |
| 2/3 | `Veho5BmVdFjO2KkEVnO7` | 1 | 0 | `5275baa4-41a5-459b-9490-ab38467f666f` | 2,600,189 bytes | `flow-Veho5BmVdFjO2KkEVnO7` | PASS | 0 |
| 3/3 | `sPvkJcTOrRp1fYft6c3p` | 1 | 0 | `0f6ab841-ea66-4961-8273-21159a41cbc5` | 2,693,535 bytes | `flow-sPvkJcTOrRp1fYft6c3p` | PASS | 0 |

Cả ba Job đều `attempt = 1`, `generateClicks = 1`, `status = succeeded`; mỗi Scene `flowStatus = succeeded`, chỉ có một `mediaAssets` record deterministic và file có MP4 signature `ftyp`. Firebase Storage upload bằng 0. E2E #2 và #3 được chạy độc lập ngày 2026-08-15 sau khi download-readiness state machine được nạp vào Local Agent.

Worker tách rõ `OUTPUT_DETECTED → OUTPUT_RENDERING → OUTPUT_READY → DOWNLOAD_READY → DOWNLOAD`. Nút Download tồn tại nhưng disabled được tiếp tục poll; chỉ khi enabled/actionable mới click đúng một lần. Timeout readiness dừng an toàn với `FLOW_OUTPUT_NOT_READY_TIMEOUT`, không Generate lại.

## Job cũ

Job `IoayvPBRrZvZ3BXzDJET` không được retry và không Generate lần hai.

- Trạng thái cuối: `needs_manual`
- Generate clicks: `1`
- Recovery disposition: `no_output_keep_needs_manual`
- Close reason: `NO_RECOVERABLE_OUTPUT_OLD_PROJECT_UNAVAILABLE`
- Kết luận: generation thuộc Flow Project cũ không có output có thể recovery bằng mapping mới; Job được đóng an toàn.

## Flow smoke trước đây — không được dùng làm bằng chứng E2E

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

Root cause production gần nhất là Chrome 136+ không cho CDP attach bằng remote-debugging flags trên default Chrome user-data-dir. System Profile 44 vẫn mở cửa sổ nhưng Playwright không attach, nên Prompt và Generate không chạy. Job cũ hơn cũng thiếu snapshot identity đủ chặt để recovery an toàn khi mapping đổi.

Các chốt an toàn đã bổ sung:

- Job mới chỉ được tạo cho ANCV managed profile đã `ready`.
- Job lưu rõ logical managed profile, expected Google account và Flow Project URL.
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
