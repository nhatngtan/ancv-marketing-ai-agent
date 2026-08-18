# PC Migration Manifest V1

Ngày kiểm kê máy cũ: 2026-08-18  
Máy cũ: `DESKTOP-NQH51S9`

## Production baseline

- Repository: `https://github.com/nhatngtan/ancv-marketing-ai-agent.git`.
- Repo path máy cũ: `C:\Users\ANCV-MK\Documents\Codex\2026-08-10\nhi-m-v-kh-i-t\outputs\ancv-marketing-ai-agent`.
- Production tag: `v1.0.1`.
- Production tag/HEAD commit: `e8befb99fc750496ab057614029820c6f13b11a2`.
- Runtime source baseline: `a2c3d604d74062cda817c9ae673707ff2ec6c79f`.
- Git working tree tại thời điểm kiểm kê: sạch; `HEAD` khớp `origin/master`.

## Old PC runtime inventory

- Local Agent package: `@ancv/flow-worker` version `0.1.0`.
- Logical Agent ID: `ancv-windows-01`.
- Machine name trong config: `DESKTOP-NQH51S9`.
- Workspace root: `D:\ANCV Marketing`.
- Bridge: loopback `127.0.0.1:32187`; token tồn tại nhưng không được ghi hoặc chuyển trong manifest.
- Local Agent process: không chạy tại thời điểm kiểm kê.
- Firestore heartbeat gần nhất: `2026-08-18T01:01:09.329Z`; trạng thái lưu là `online` nhưng heartbeat đã stale tại thời điểm kiểm tra.
- Workspace availability ở heartbeat gần nhất: `true`.
- Scheduled Task: `ANCV Local Agent`, trạng thái `Ready`, trigger khi đăng nhập, lần chạy gần nhất `2026-08-18 08:00:39 +07:00`, result `3221225786`.
- Scheduled Task vẫn phải được disable trên máy cũ trước khi bật Agent máy mới.

## Tool versions for reference

- Node.js: `v24.16.0`.
- npm: `11.13.0`.
- Firebase CLI: `15.25.1`.
- Google Cloud CLI: `579.0.0`.
- gcloud account/project tại thời điểm kiểm kê: `nhat.ngtan@gmail.com` / `ancv-marketing-ai-agent`.

## Google Flow mapping

- Logical profile ID: `flow-gold`.
- Profile type: managed, non-default Chrome user-data-dir.
- Old-PC profile location: `%LOCALAPPDATA%\ANCV\flow-profiles\gold`.
- Expected/verified account: `ashimigold@gmail.com`.
- Flow Project ID: `46c51acb-8d28-418b-8a70-b6ab0c4207ba`.
- Firestore account state: `ready`, `available`, `experimental`, E2E `pass_3_of_3`.
- Chrome profile/session không portable và không được copy sang máy mới.

## Workspace inventory

- Workspace: `D:\ANCV Marketing`.
- Project directories: `9`.
- Files: `8`.
- Total bytes: `19,800,577`.
- Video Raw: `6` files / `15,136,468` bytes.
- Video Final: `2` files / `4,664,109` bytes.
- Local Article images: `0`; Article images production đang ở Firebase Storage.
- Local metadata/helper files trong workspace: `0`.

### Firestore local asset verification

- Local assets referenced: `8`.
- Relative paths valid: `8/8`.
- Files found below workspace root: `8/8`.
- Stored size matches actual file: `8/8`.
- Missing files: `0`.
- Absolute paths: `0`.
- Path traversal: `0`.
- Paths outside workspace: `0`.
- Flow jobs queued/processing: `0`.
- Local commands queued/processing: `0`.

## Must transfer

- Copy the complete `D:\ANCV Marketing` directory while preserving its internal structure and timestamps where practical.
- Keep the destination folder name exactly `ANCV Marketing`.
- Preserve every file referenced by Firestore; do not rename Project, Scene, Video Raw or Video Final paths.
- Transfer this manifest through Git after backup verification is recorded.
- On the new PC, clone the repository from GitHub and checkout `v1.0.1`; do not use a copied working tree as the primary source.
- Recreate Local Agent configuration, bridge token and Scheduled Task on the new PC using the repository tooling.

## Must not transfer

- OpenAI key, YouTube refresh token, OAuth client secret or WordPress credential.
- Service-account private keys, ADC cache, Firebase/gcloud credential cache or personal CLI sessions.
- Chrome cookies, Login Data, Local State secret material or the current `flow-gold` directory.
- `%LOCALAPPDATA%\ANCV\flow-worker-data` browser/session data.
- Existing Local Agent bridge token or complete `config.json`.
- `node_modules`, `dist`, build cache, emulator cache or repository working directory as the primary source.
- Cloud-hosted Firebase, Firestore, Storage, Hosting, Cloud Run or Secret Manager data.

## Backup status

- Backup completed: `2026-08-18 13:09:57 +07:00`.
- Backup destination: `Z:\Dong phuc ANCV\ANCV-PC-MIGRATION\ANCV Marketing`.
- Copy method: Robocopy `/E /COPY:DAT /DCOPY:DAT /R:2 /W:3 /XJ /FFT`; không dùng `/MIR`, `/PURGE`, `/MOVE` hoặc `/MOV`; source được giữ nguyên.
- Robocopy result: exit code `1` (copy completed successfully), `8/8` files copied, `19,800,577` bytes, failed `0`, extras `0`.
- Copy log: `Z:\Dong phuc ANCV\ANCV-PC-MIGRATION\robocopy-ancv-marketing.log`.
- Verification summary: `Z:\Dong phuc ANCV\ANCV-PC-MIGRATION\ANCV_PC_MIGRATION_VERIFY_V1.json`.
- SHA256 manifest: `Z:\Dong phuc ANCV\ANCV-PC-MIGRATION\ANCV_LOCAL_ASSET_SHA256_V1.csv`.
- Destination verification: `8` files / `19,800,577` bytes; missing `0`, extras `0`, size mismatch `0`.
- Critical SHA256 verification: `8/8` referenced Video Raw/Video Final assets matched; mismatch `0`.

## Migration verification checklist

- [x] Copy `D:\ANCV Marketing` to `Z:\Dong phuc ANCV\ANCV-PC-MIGRATION\ANCV Marketing` without deleting source or destination files.
- [x] Source and backup both report `8` files and `19,800,577` bytes.
- [x] Missing files after copy equal `0`.
- [x] SHA256 matches for all `8` referenced Video Raw/Video Final files.
- [ ] New PC restores the same workspace root `D:\ANCV Marketing`.
- [ ] New PC clone is checked out at production tag `v1.0.1` and builds cleanly.
- [ ] New Local Agent config uses logical Agent ID `ancv-windows-01` and workspace root `D:\ANCV Marketing`.
- [ ] Old PC has zero active Flow/Local jobs before cutover.
- [ ] Old PC Scheduled Task is disabled and Local Agent process is stopped before starting the new Agent.
- [ ] Old heartbeat becomes stale/offline before the new Agent starts.
- [ ] New Local Agent heartbeat is fresh, `workspaceAvailable=true`, and backend reports Online.
- [ ] Eight Firestore local asset relative paths resolve without Firestore path updates.
- [ ] Create/reuse new managed profile `flow-gold`; do not copy the old session.
- [ ] User signs in interactively to `ashimigold@gmail.com` only if required.
- [ ] READ-ONLY Flow preflight passes account, Project, Prompt, Video, x1 and unique Generate locator.
- [ ] Migration preflight records `generateClicks=0`.
- [ ] Stop at `READY_FOR_NEW_PC_FLOW_E2E = YES` until owner authorizes one real Flow E2E.
