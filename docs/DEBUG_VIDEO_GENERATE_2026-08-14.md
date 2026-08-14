# Debug Video Generate — 2026-08-14

Tài liệu này ghi lại evidence ở trạng thái code freeze. Không có Generate, OpenAI call, sửa behavior, restart Local Agent hoặc deploy trong quá trình thu thập.

## USER SYMPTOM

- Người dùng bấm gì: mở Video Studio và bấm `Tạo video`.
- UI hiển thị gì: không có client screenshot/error telemetry đủ để xác minh chính xác; người dùng báo kết quả không xuất hiện.
- Kết quả thực tế: không có Content mới và không có Flow Job mới trong Firestore.
- Lưu ý định danh: UI có hai điểm dễ được gọi là “Tạo video”: nút `Tạo Video` mở form Content và nút `Tạo video` theo từng Scene. Không có correlation ID phía client, nên không được suy đoán điểm click. Evidence production gần nhất chỉ khớp với nhánh tạo Content.

## LAST FAILED ATTEMPT

- Content: không có document được lưu. ID gần nhất suy ra từ `systemCounters/video-2026` là `ANCV-VID-2026-008`; đây chỉ là ID đã cấp, không phải Content đã tồn tại.
- Scene: `UNKNOWN` — không có Scene mới để liên kết.
- Job: `UNKNOWN` — không có Flow Job mới; job mới nhất vẫn là baseline ngày 2026-08-12.
- Time: request tương quan gần nhất `2026-08-14T07:38:23.662722Z` (`14:38:23` ICT); counter cập nhật `2026-08-14T07:38:23.985Z`.
- Account: `UNKNOWN`.
- Profile: `UNKNOWN`. Mapping Google Flow gần nhất là Chrome `Profile 42`, label `Nhat`, cập nhật ngày 2026-08-12; không có evidence nó được dùng cho lần click này.
- Engine: `UNKNOWN` — execution chưa đến bước tạo Flow Job.
- Status: không có Content/Scene/Job mới để gán status.
- Error: không có error code/message an toàn được ghi ở server. Cloud Run không có log ERROR/PERMISSION_DENIED trong cửa sổ tương quan.
- Local Agent: Firestore còn giá trị `status=online` nhưng heartbeat cuối là `2026-08-14T06:02:20.825Z` (`13:02:20` ICT), nên đã stale theo ngưỡng 45 giây của ứng dụng tại thời điểm request 14:38. `bridgeStatus=disconnected`, `currentProfileId=null`.
- Agent received: không; không có job để nhận.
- `generateIntentAt`: không có cho lần lỗi.
- `generateClicks`: không có cho lần lỗi.
- `baselineOutputIds`: không có cho lần lỗi.
- `outputId`: không có cho lần lỗi.
- Download: không bắt đầu.

## EXECUTION TRACE

### Nhánh A — tạo Video Content

- UI: `apps/web/src/components/ContentStudio.tsx` — `ContentStudioPage` gọi `onCreate` từ nút `Tạo Video`.
- Form: `apps/web/src/App.tsx` — `CreateContentModal.submit()` gọi `createContent()`.
- API cấp ID: `apps/web/src/lib/repository.ts` — `createContent()` gọi `POST /v1/content/allocate-id`.
- Backend: `services/backend/src/modules/content-service.ts` — `contentRouter.post('/allocate-id')` gọi `allocateContentId()`.
- Counter: `services/backend/src/services/content-id.ts` — transaction cập nhật `systemCounters/video-2026` và trả Content ID.
- Firestore client write: `apps/web/src/lib/repository.ts` — `addDoc(collection(firestore, 'contents'), ...)`.
- UI refresh: `subscribeContents()` dùng Firestore `onSnapshot` rồi cập nhật danh sách trong `apps/web/src/App.tsx`.
- Evidence hiện tại: API cấp ID đã trả `201` bốn lần; counter đạt `8`; không có Content document mới. Điểm dừng quan sát được nằm sau cấp ID và trước/ở client Firestore write. Nguyên nhân cụ thể: `UNKNOWN`.

### Nhánh B — tạo một video Google Flow cho Scene

- UI: `apps/web/src/components/ContentStudio.tsx` — `FlowComposer.onGenerate` → `SceneEditor` → `createFlowJob(content.id, scene.id, accountId)`.
- API: `apps/web/src/lib/repository.ts` — `POST /v1/flow/jobs`.
- Backend: `services/backend/src/modules/flow-service.ts` — `flowRouter.post('/jobs')` validate Content/Scene/Flow account/project/prompt, ghi `flowJobs/{sceneId}` và đặt Scene `flowStatus=queued` trong transaction.
- Firestore: collection `flowJobs`; job ID bằng Scene ID.
- Local Agent: `tools/flow-worker/src/local-agent.ts` — `LocalAgent.start()` poll; `nextFlowJob()` claim job `queued`; `processFlowJob()` route `playwright_fallback` sang `processPlaywrightJob()`.
- Flow Worker: `tools/flow-worker/src/worker.ts` — `processPlaywrightJob()` mở đúng project/profile, preflight, ghi `generateIntentAt`/baseline, click đúng một lần, tìm output mới và download.
- Browser Bridge: `tools/flow-worker/src/bridge-server.ts` + `tools/flow-worker/extension/service-worker.js` — register/heartbeat/command/result và thao tác read-only/Flow UI; bridge generate hiện fail-closed sang Playwright.
- Google Flow detection: `tools/flow-worker/src/flow-ui.ts` — `inspectFlowUi()`, `getStableFlowOutputIds()`, `openFlowOutputById()`, `findDownloadControl()`.
- Download/persistence: `tools/flow-worker/src/local-storage.ts` — `persistLocalVideo()` xác minh file/MP4/hash, copy local-first, ghi `mediaAssets`, cập nhật Job/Scene và xóa file tạm sau commit.
- Web refresh: `subscribeScenes()`, `subscribeAssets()` và `subscribeFlowJobs()` trong `apps/web/src/lib/repository.ts` dùng `onSnapshot` cho `StudioDrawer`.
- Evidence hiện tại: không có request `/v1/flow/jobs` từ 2026-08-13 trở đi; nhánh B không bắt đầu ở lần lỗi được báo.

## RELEVANT SOURCE FILES

- `apps/web/src/App.tsx`
- `apps/web/src/components/ContentStudio.tsx`
- `apps/web/src/lib/repository.ts`
- `apps/web/src/lib/firebase.ts`
- `services/backend/src/app.ts`
- `services/backend/src/modules/content-service.ts`
- `services/backend/src/modules/flow-service.ts`
- `services/backend/src/services/content-id.ts`
- `services/backend/src/middleware/auth.ts`
- `packages/shared/src/index.ts`
- `firebase/firestore.rules`
- `firebase/firestore.indexes.json`
- `tools/flow-worker/src/index.ts`
- `tools/flow-worker/src/local-agent.ts`
- `tools/flow-worker/src/profile-manager.ts`
- `tools/flow-worker/src/worker.ts`
- `tools/flow-worker/src/flow-ui.ts`
- `tools/flow-worker/src/local-storage.ts`
- `tools/flow-worker/src/bridge-server.ts`
- `tools/flow-worker/extension/manifest.json`
- `tools/flow-worker/extension/service-worker.js`

## LOG EVIDENCE

- Cloud Run revision quan sát: `ancv-marketing-backend-00032-j4j`.
- Bốn request `POST /v1/content/allocate-id` trả `201`: `07:38:11.738757Z`, `07:38:16.321448Z`, `07:38:21.889005Z`, `07:38:23.662722Z`.
- `systemCounters/video-2026`: `value=8`, `updatedAt=2026-08-14T07:38:23.985Z`.
- Firestore `contents`: chỉ có ba fixture cũ, lần cập nhật mới nhất `2026-08-12`; không có `ANCV-VID-2026-005` đến `008`.
- Cloud Run từ `2026-08-13T00:00:00Z`: không có request/log `/v1/flow/jobs`.
- Cloud Run trong cửa sổ `07:35–07:42Z`: không có log mức ERROR hoặc `PERMISSION_DENIED`.
- Firestore `flowJobs`: chỉ có ba job cũ và đều `succeeded`; job mới nhất cập nhật `2026-08-12T06:30:03.530Z`.
- Windows Task `ANCV Local Agent`: trạng thái audit là `Ready`, lần chạy gần nhất `2026-08-14T13:02:01+07:00`; task chạy `npm run local:agent` từ đúng repository này. Không restart task trong review.
- Local log không gắn timestamp theo event, nên không được dùng để suy đoán event nào thuộc lần click 14:38.

## KNOWN WORKING BASELINE

- Pipeline strict local-first đã PASS ngày 2026-08-12 với Content `ANCV-VID-2026-LOCALTEST-026989`, Scene/Job `MnjlRelsDL2zkWmIDClC`, account `account-01`.
- Job có `generateIntentAt=2026-08-12T06:11:45.052Z`, `generateClicks=1`, ba baseline output IDs, output mới `334ab6c9-adad-4cef-a827-bd6824374484`, `executionEngine=playwright_fallback`.
- Đúng một MP4 `2,119,046` bytes được lưu local-first, đúng một asset `flow-MnjlRelsDL2zkWmIDClC`; Job và Scene đều `succeeded`, không duplicate.
- Evidence chi tiết: `docs/UAT_PHASE_2D4A.md` và `docs/UAT_PHASE_3.md`.

## CURRENT DIFFERENCE

- Baseline PASS có Content + Scene + Flow Job persisted trước khi Local Agent xử lý.
- Lần lỗi hiện tại chỉ có evidence cấp Content ID; không có Content/Scene/Flow Job mới để pipeline nhận.
- Local Agent không có heartbeat fresh và Browser Bridge disconnected ở thời điểm tương quan; tuy nhiên điều này không giải thích độc lập việc Content document không được lưu.
- Nguyên nhân chính xác khiến client không hoàn tất bước Firestore write hoặc không hiển thị lỗi: `UNKNOWN`.
