# UAT Giai đoạn 2D.3C — Generate Input

Ngày kiểm thử: 2026-08-12. Kết quả: **INPUT ISSUE REMAINS**.

## Input evidence

- Generate trước đây dùng DOM `element.click()`.
- ANCV Browser Bridge `0.1.2` được cấp permission tối thiểu `debugger`.
- Harmless test PASS hai lần liên tiếp: attach vào đúng tab Flow, CDP mouse mở menu cấu hình, detach; reattach, CDP mouse đóng menu, detach.
- Session, project, Video, x1 và baseline 3 output ID vẫn ổn định sau harmless test.

## Final smoke

- Content: `ANCV-VID-2026-LOCALTEST-026989`.
- Job / Scene: `MnjlRelsDL2zkWmIDClC`.
- Baseline output IDs: `22def277-65fc-4c9a-a306-046140b3b5fa`, `d175dd74-47cc-40a6-b01d-c65fe18dbd8a`, `2b96f8c1-6a93-4858-b3d1-262f4058c821`.
- `generateIntentAt`: `2026-08-12T05:37:29.361Z`.
- Input: đúng một CDP mouse sequence; `generateClicks=1`, `generateInputMethod=cdp_mouse`.
- Acceptance signal: false.
- Generation network request observed: false. Không ghi URL, body, header, cookie hoặc token.
- Processing observed: false.
- New output IDs: 0.
- Job/Scene: `needs_manual` với `FLOW_GENERATE_NOT_ACCEPTED_NO_RETRY`.
- Media asset: 0; local file: 0; Firebase Storage upload: 0; temp file mới: 0.

## Kết luận và routing

CDP low-level mouse hoạt động với control vô hại nhưng Flow không có acceptance signal khi áp dụng cho Generate. Không test thêm và không ép Browser Bridge làm execution path Generate.

Browser Bridge tiếp tục dùng cho Profile Manager, session, navigation, read-only inspection và harmless diagnostics. Command Generate của Bridge bị fail-closed. Job mới được route sang `playwright_fallback`; local-first storage strategy giữ nguyên.
