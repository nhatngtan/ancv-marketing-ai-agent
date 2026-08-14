# ANCV Review Manifest

Manifest này chỉ đường tới source đang được repository sử dụng tại thời điểm code freeze. Local credential, Chrome profile/session, downloaded video và generated media không thuộc review package.

## WEB

- `apps/web/src/main.tsx` — React entry.
- `apps/web/src/App.tsx` — app shell, route/page state, Content create modal, Firestore subscriptions.
- `apps/web/src/components/ContentStudio.tsx` — Video/Article Studio, Scene Editor, Flow composer và media/copy UI.
- `apps/web/src/lib/repository.ts` — API client, Firestore reads/writes/subscriptions, Flow job request.
- `apps/web/src/lib/firebase.ts` — Firebase client initialization/auth.
- `apps/web/src/App.test.tsx`, `apps/web/src/firestore.rules.test.ts` — Web và Rules tests.

## BACKEND

- `services/backend/src/server.ts` — process entry.
- `services/backend/src/app.ts` — Express app/routes/error handling.
- `services/backend/src/modules/content-service.ts` — Content ID, Scene CRUD và Content workflow routes.
- `services/backend/src/modules/flow-service.ts` — Flow profile endpoints và transactional Flow Job creation.
- `services/backend/src/middleware/auth.ts` — Firebase auth/role enforcement.
- `services/backend/src/firebase.ts` — Admin SDK access.
- `services/backend/src/services/content-id.ts` — concurrent-safe Content ID counter.
- `services/backend/test/` — backend unit tests.

## LOCAL AGENT

- `tools/flow-worker/src/index.ts` — CLI entry and command routing.
- `tools/flow-worker/src/local-agent.ts` — heartbeat, Firestore job polling/claim, safe-failure routing.
- `tools/flow-worker/src/configure-local-agent.ts` — local-only agent configuration bootstrap.
- `tools/flow-worker/src/config.ts` — safe env/config names and path isolation.
- `tools/flow-worker/src/profile-manager.ts` — Chrome profile selection/launch and bridge binding.
- `tools/flow-worker/src/chrome-profile-scanner.ts` — profile discovery metadata.
- `tools/flow-worker/src/chrome.ts`, `tools/flow-worker/src/browser.ts` — real Chrome/CDP lifecycle.
- `scripts/install-local-agent-autostart.ps1` — scoped Windows Task installation.

Runtime check: Windows Task `ANCV Local Agent` invokes `npm run local:agent` with this repository as working directory. Its local `.cmd`, config, bridge token and browser profiles intentionally remain outside Git.

## FLOW

- `tools/flow-worker/src/worker.ts` — Playwright fallback execution, one-click intent record, recovery and download orchestration.
- `tools/flow-worker/src/flow-ui.ts` — Flow session/preflight, stable output IDs, output/detail/download locators.
- `tools/flow-worker/src/account.ts` — account/session helpers.
- `tools/flow-worker/src/firebase.ts` — Worker Firestore/Admin access.
- `tools/flow-worker/src/existing-generation-diagnostic.ts` — read-only existing-generation diagnostic.
- `tools/flow-worker/test/local-agent.test.ts` — Local Agent/Flow behavior tests.

## BROWSER BRIDGE

- `tools/flow-worker/extension/manifest.json` — unpacked Chrome extension manifest.
- `tools/flow-worker/extension/service-worker.js` — extension register/heartbeat/command execution and download observation.
- `tools/flow-worker/extension/setup.js` — profile/bridge setup page logic.
- `tools/flow-worker/src/bridge-server.ts` — loopback-only bridge server and command/result channel.

## STORAGE

- `tools/flow-worker/src/local-storage.ts` — local-first pathing, MP4/file/hash verification, idempotent `mediaAssets` persistence and temp cleanup.
- `packages/shared/src/index.ts` — `MediaAssetRecord`, `FlowJobRecord`, `SceneRecord`, Local Agent/profile shared contracts.
- `firebase/storage.rules` — Firebase media path rules for non-Flow/manual uploads.

## CONFIG

- `package.json`, `package-lock.json` — workspace commands and locked dependencies.
- `firebase.json`, `.firebaserc` — Firebase project/deploy mapping.
- `firebase/firestore.rules`, `firebase/firestore.indexes.json`, `firebase/storage.rules` — database/storage policy and indexes.
- `services/backend/src/config.ts` — backend env/Secret Manager references.
- `apps/web/.env.example` — variable names only; no values.
- `.gitignore` — excludes `.env*`, service-account/credential JSON, logs, Flow data, screenshots and downloads.
- `scripts/bootstrap-gcp.ps1`, `scripts/deploy.ps1`, `scripts/identity-preflight.ps1` — reproducible infrastructure/deploy/preflight scripts.

## REVIEW ORDER

1. `docs/DEBUG_VIDEO_GENERATE_2026-08-14.md`
2. `apps/web/src/App.tsx` and `apps/web/src/lib/repository.ts`
3. `apps/web/src/components/ContentStudio.tsx`
4. `services/backend/src/modules/content-service.ts` and `services/backend/src/modules/flow-service.ts`
5. `tools/flow-worker/src/local-agent.ts` and `tools/flow-worker/src/worker.ts`
6. `tools/flow-worker/src/flow-ui.ts`, `tools/flow-worker/src/local-storage.ts`, Bridge source
7. `docs/UAT_PHASE_2D4A.md` and `docs/UAT_PHASE_3.md`
