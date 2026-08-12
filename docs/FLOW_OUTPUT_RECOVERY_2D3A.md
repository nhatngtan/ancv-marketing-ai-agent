# Flow Output Recovery 2D.3A

Ngày kiểm tra: 2026-08-12. Job: `eO7MHCKWK5pZV1pa548F`.

## Phạm vi an toàn

- Chỉ đọc project Flow hiện tại bằng dedicated profile `account-01`.
- Không bấm Generate; tổng số click của job vẫn là `1`.
- Không gọi OpenAI, không upload Firebase Storage và không tạo media asset.

## Evidence của generation hiện tại

Project: `b242cebe-fb9a-464a-8aeb-802b669a4a2e`.

CDP read-only diagnostic xác định đúng 3 output ID hiện hữu:

- `22def277-65fc-4c9a-a306-046140b3b5fa`
- `d175dd74-47cc-40a6-b01d-c65fe18dbd8a`
- `2b96f8c1-6a93-4858-b3d1-262f4058c821`

Baseline trước lần Generate là 3 output. Số output hiện tại vẫn là 3; không có output mới xuất hiện muộn. DOM không hiển thị trạng thái processing hoặc generation error tại thời điểm kiểm tra.

Firestore evidence:

- Job: `needs_manual`.
- Scene: `needs_manual`.
- `generateIntentAt`: `2026-08-12T03:34:12.587Z`.
- `generateClicks`: `1`.
- `flowDetailId`: không có.
- `assetId`: không có.
- Media asset của job: `0`.
- Firebase Storage object dưới prefix Flow Worker: `0`.

## Nguyên nhân detection

Logic cũ dựa vào số thumbnail video đang visible. Flow lazy-load/virtualize DOM nên cùng project có thể tạm thời trả `0` thumbnail trong Browser Bridge trong khi phép đọc CDP ổn định xác định 3 output link. Vì vậy thumbnail count không phải định danh output đáng tin cậy.

Detection đã được đổi sang ID ổn định lấy từ URL `/edit/{outputId}`. Trước Generate, worker phải quan sát baseline ổn định; baseline rỗng chỉ hợp lệ khi Flow hiển thị empty state rõ ràng. Nếu DOM không đủ evidence, worker dừng với `FLOW_OUTPUT_BASELINE_UNSTABLE` trước khi Generate. Sau Generate, worker chỉ chấp nhận đúng một ID mới so với baseline, mở đúng ID đó và không chọn “video mới nhất” theo vị trí DOM.

Recovery sau restart chỉ được chạy khi job đã lưu `baselineOutputIds`. Job cũ này không có field đó, nên worker không được đoán hoặc download một trong ba output cũ.

Timeout generation không được tăng. Polling mới phân biệt `processing`, `generation error`, baseline không ổn định và timeout không có output; không thêm retry Generate.

## Kết quả

**DETECTION FIXED / STILL NEEDS MANUAL**.

Generation cũ không thể recovery an toàn vì không có output mới. Manual fallback tiếp tục giữ nguyên. Không chạy thêm Generate trong Phase 2D.3A.
