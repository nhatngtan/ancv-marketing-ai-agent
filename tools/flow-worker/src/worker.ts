import { randomUUID } from 'node:crypto';
import { mkdir, readdir, rename, stat, unlink } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import type { FlowAccountRecord, FlowJobRecord } from '@ancv/shared';
import { connectAccountContext } from './browser.js';
import { resolveManagedFlowProfile } from './chrome.js';
import { ensureLocalDirectories, flowConfig, loadLocalAgentConfig, pathInsideDataRoot, pathInsideWorkspace } from './config.js';
import { firestore, storageBucket } from './firebase.js';
import { findNewFlowOutputIds, flowProjectBaseUrl, getFlowOutputIds, getStableFlowOutputIds, inspectFlowDownloadReadiness, inspectFlowUi, isSingleOutputSelected, openExistingFlowProject, openFlowOutputById, waitForFlowApprovalControl, waitForFlowUi, type FlowDownloadReadiness, type LocatedControl } from './flow-ui.js';
import { assertFlowRuntimeSnapshot } from './flow-runtime.js';
import { verifyGoogleAccount } from './google-account.js';
import { persistLocalVideo } from './local-storage.js';

const sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export function findNewCompletedDownloads(before: string[], current: string[]): string[] {
  const baseline = new Set(before);
  return current.filter((fileName) => !baseline.has(fileName) && !fileName.endsWith('.crdownload'));
}

export function flowJobTempRelativePath(job: FlowJobRecord): string {
  const scene = String(job.sceneNumber).padStart(2, '0');
  return `.tmp/flow/${job.id}/${job.contentId}_S${scene}_T01.mp4`;
}

export type DownloadReadinessState = 'OUTPUT_DETECTED' | 'OUTPUT_RENDERING' | 'OUTPUT_READY' | 'DOWNLOAD_READY' | 'DOWNLOAD';
export type DownloadReadinessResult = { status: 'downloaded' } | { status: 'failed'; error: string } | { status: 'timeout' };

export function downloadReadinessFailure(result: DownloadReadinessResult): { status: 'needs_manual'; error: string } | null {
  if (result.status === 'timeout') return { status: 'needs_manual', error: 'FLOW_OUTPUT_NOT_READY_TIMEOUT' };
  if (result.status === 'failed') return { status: 'needs_manual', error: `FLOW_OUTPUT_RENDER_FAILED:${result.error}` };
  return null;
}

export async function runDownloadReadinessStateMachine<T>(options: {
  deadlineAt: number;
  pollIntervalMs: number;
  probe: () => Promise<{ state: FlowDownloadReadiness['state']; control: T | null; failureText?: string }>;
  wait: (milliseconds: number) => Promise<void>;
  download: (control: T) => Promise<void>;
  onState: (state: DownloadReadinessState) => Promise<void>;
  now?: () => number;
}): Promise<DownloadReadinessResult> {
  const now = options.now ?? Date.now;
  await options.onState('OUTPUT_DETECTED');
  await options.onState('OUTPUT_RENDERING');
  while (now() < options.deadlineAt) {
    const readiness = await options.probe();
    if (readiness.state === 'OUTPUT_FAILED') {
      return { status: 'failed', error: readiness.failureText ?? 'FLOW_OUTPUT_RENDER_FAILED' };
    }
    if (readiness.state === 'DOWNLOAD_READY' && readiness.control) {
      await options.onState('OUTPUT_READY');
      await options.onState('DOWNLOAD_READY');
      await options.download(readiness.control);
      await options.onState('DOWNLOAD');
      return { status: 'downloaded' };
    }
    await options.wait(Math.min(options.pollIntervalMs, Math.max(1, options.deadlineAt - now())));
  }
  return { status: 'timeout' };
}

async function downloadThroughFlowUi(
  page: Awaited<ReturnType<typeof connectAccountContext>>['page'],
  control: LocatedControl,
  targetPath: string,
): Promise<void> {
  const downloadDirectory = dirname(targetPath);
  await mkdir(downloadDirectory, { recursive: true });
  await stat(targetPath)
    .then(() => { throw new Error('FLOW_DOWNLOAD_TEMP_EXISTS'); })
    .catch((error: NodeJS.ErrnoException) => {
      if (error.message === 'FLOW_DOWNLOAD_TEMP_EXISTS') throw error;
      if (error.code !== 'ENOENT') throw error;
    });
  const baseline = await readdir(downloadDirectory);
  if (baseline.length) throw new Error('FLOW_DOWNLOAD_TEMP_NOT_EMPTY');
  const cdp = await page.context().newCDPSession(page);
  let playwrightEvent = false;
  let cdpStarted = false;
  let cdpCompleted = false;
  page.once('download', () => { playwrightEvent = true; });
  cdp.on('Browser.downloadWillBegin', () => { cdpStarted = true; });
  cdp.on('Browser.downloadProgress', (event) => {
    if (event.state === 'completed') cdpCompleted = true;
  });
  try {
    await cdp.send('Browser.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: downloadDirectory,
      eventsEnabled: true,
    });
    await control.locator.click({ timeout: 15_000 });
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      await page.waitForTimeout(1_000);
      const candidates = findNewCompletedDownloads(baseline, await readdir(downloadDirectory));
      if (candidates.length > 1) throw new Error(`FLOW_DOWNLOAD_AMBIGUOUS:${candidates.length}`);
      if (candidates.length === 1) {
        const downloadedPath = join(downloadDirectory, candidates[0]!);
        const details = await stat(downloadedPath);
        if (!details.isFile() || details.size < 1_024) continue;
        if (downloadedPath !== targetPath) await rename(downloadedPath, targetPath);
        console.log(JSON.stringify({
          event: 'flow_download_ui_completed', playwrightEvent, cdpStarted, cdpCompleted,
          fileName: targetPath.split(/[\\/]/).at(-1), bytes: details.size,
        }));
        return;
      }
    }
    throw new Error('FLOW_DOWNLOAD_UI_TIMEOUT');
  } finally {
    await cdp.detach().catch(() => undefined);
  }
}

async function markInterruptedJobs(): Promise<void> {
  const snapshot = await firestore.collection('flowJobs').where('status', '==', 'processing').get();
  if (snapshot.empty) return;
  const now = new Date().toISOString(); const batch = firestore.batch();
  snapshot.docs.forEach((document) => {
    batch.update(document.ref, { status: 'needs_manual', stage: 'needs_manual', error: 'Worker restart khi job đang xử lý; không tự Generate lại.', updatedAt: now });
    const job = document.data() as FlowJobRecord;
    batch.update(firestore.collection('scenes').doc(job.sceneId), { flowStatus: 'needs_manual', updatedAt: now });
  });
  await batch.commit();
}

async function nextQueuedJob(): Promise<FlowJobRecord | null> {
  const snapshot = await firestore.collection('flowJobs').where('status', '==', 'queued').get();
  const candidates = snapshot.docs.map((document) => document.data() as FlowJobRecord)
    .filter((job) => job.executionMode !== 'local_agent')
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  const candidate = candidates[0]; if (!candidate) return null;
  const ref = firestore.collection('flowJobs').doc(candidate.id);
  return firestore.runTransaction(async (transaction) => {
    const current = await transaction.get(ref); const job = current.data() as FlowJobRecord | undefined;
    if (!job || job.status !== 'queued') return null;
    const now = new Date().toISOString();
    transaction.update(ref, { status: 'processing', stage: 'opening_flow', startedAt: now, updatedAt: now, workerInstanceId: process.pid });
    transaction.update(firestore.collection('scenes').doc(job.sceneId), { flowStatus: 'processing', updatedAt: now });
    return { ...job, status: 'processing', stage: 'opening_flow', startedAt: now, updatedAt: now };
  });
}

async function failJob(job: FlowJobRecord, error: string, accountStatus?: FlowAccountRecord['status']): Promise<void> {
  const now = new Date().toISOString(); const batch = firestore.batch();
  batch.update(firestore.collection('flowJobs').doc(job.id), { status: 'needs_manual', stage: 'needs_manual', error: error.slice(0, 500), updatedAt: now });
  batch.update(firestore.collection('scenes').doc(job.sceneId), { flowStatus: 'needs_manual', updatedAt: now });
  if (accountStatus) batch.update(firestore.collection('flowAccounts').doc(job.flowAccountId), { status: accountStatus, limitation: error.slice(0, 500), updatedAt: now, lastCheckedAt: now });
  await batch.commit();
}

async function uploadVideo(job: FlowJobRecord, filePath: string): Promise<{ assetId: string; storagePath: string }> {
  const existing = await firestore.collection('mediaAssets').where('contentDocId', '==', job.contentDocId).where('sceneId', '==', job.sceneId).get();
  const takeNumber = Math.max(0, ...existing.docs.map((document) => Number(document.data().takeNumber ?? 0))) + 1;
  const extension = extname(filePath) || '.mp4';
  const fileName = `${job.contentId}_S${String(job.sceneNumber).padStart(2, '0')}_T${String(takeNumber).padStart(2, '0')}${extension}`;
  const storagePath = `content/${job.contentDocId}/scene_take/${job.sceneId}/${job.id}-${fileName}`;
  const token = randomUUID();
  const file = storageBucket.file(storagePath);
  await file.save(await import('node:fs/promises').then((module) => module.readFile(filePath)), {
    resumable: false, contentType: 'video/mp4', metadata: { metadata: { firebaseStorageDownloadTokens: token, contentId: job.contentId, sceneId: job.sceneId, source: 'google_flow_worker', flowAccountId: job.flowAccountId } },
  });
  const details = await stat(filePath); const assetRef = firestore.collection('mediaAssets').doc(); const now = new Date().toISOString();
  const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(storageBucket.name)}/o/${encodeURIComponent(storagePath)}?alt=media&token=${token}`;
  await assetRef.set({ id: assetRef.id, contentDocId: job.contentDocId, contentId: job.contentId, kind: 'scene_take', storagePath, downloadUrl, fileName, contentType: 'video/mp4', sizeBytes: details.size, sceneId: job.sceneId, takeNumber, selected: false, source: 'google_flow_worker', flowAccountId: job.flowAccountId, flowJobId: job.id, status: 'ready', createdAt: now, updatedAt: now, createdBy: `flow-worker:${job.flowAccountId}` });
  const batch = firestore.batch();
  batch.update(firestore.collection('flowJobs').doc(job.id), { status: 'succeeded', stage: 'completed', assetId: assetRef.id, completedAt: now, updatedAt: now, error: null });
  batch.update(firestore.collection('scenes').doc(job.sceneId), { status: 'used', flowStatus: 'succeeded', lastFlowAssetId: assetRef.id, updatedAt: now });
  await batch.commit();
  return { assetId: assetRef.id, storagePath };
}

export async function processPlaywrightJob(job: FlowJobRecord): Promise<void> {
  const accountSnapshot = await firestore.collection('flowAccounts').doc(job.flowAccountId).get();
  const account = accountSnapshot.data() as FlowAccountRecord | undefined;
  if (!account || account.status !== 'ready') { await failJob(job, 'Tài khoản Flow chưa sẵn sàng.', account?.status ?? 'needs_login'); return; }
  try {
    const mapping = resolveManagedFlowProfile(job.flowAccountId, job.managedProfileId);
    assertFlowRuntimeSnapshot(job, account, mapping);
  } catch (error) {
    await failJob(job, error instanceof Error ? error.message : 'FLOW_RUNTIME_MAPPING_INVALID', 'unavailable');
    return;
  }
  let session: Awaited<ReturnType<typeof connectAccountContext>>;
  try {
    session = await connectAccountContext(job.flowAccountId, job.managedProfileId);
  } catch (error) {
    await failJob(job, error instanceof Error ? error.message : 'FLOW_CDP_ATTACH_FAILED');
    return;
  }
  const { page } = session;
  let downloadedPath = '';
  try {
    let verification: Awaited<ReturnType<typeof verifyGoogleAccount>>;
    try { verification = await verifyGoogleAccount(session.context, job.expectedAccount ?? ''); }
    catch (error) {
      const detail = error instanceof Error ? error.message : 'FLOW_ACCOUNT_VERIFICATION_FAILED';
      await failJob(job, detail, detail === 'FLOW_ACCOUNT_NOT_DETECTED' ? 'needs_login' : 'unavailable');
      return;
    }
    await firestore.collection('flowAccounts').doc(job.flowAccountId).update({
      expectedAccount: verification.expectedAccount,
      verifiedAccount: verification.verifiedAccount,
      verifiedAt: verification.verifiedAt,
      lastCheckedAt: verification.verifiedAt,
      updatedAt: verification.verifiedAt,
    });
    await openExistingFlowProject(page, job.flowProjectUrl, flowConfig.flowUrl);
    if (flowProjectBaseUrl(page.url()) !== flowProjectBaseUrl(job.flowProjectUrl)) {
      await failJob(job, 'FLOW_PROJECT_MISMATCH', 'unavailable');
      return;
    }
    const recoveryMode = Boolean(job.generateIntentAt);
    const ui = recoveryMode ? await inspectFlowUi(page) : await waitForFlowUi(page);
    if (recoveryMode && ['needs_login', 'needs_verification'].includes(ui.session)) {
      const accountStatus = ui.session === 'needs_verification' ? 'needs_verification' : 'needs_login';
      await failJob(job, ui.limitation ?? `Flow recovery preflight: ${ui.session}`, accountStatus); return;
    }
    if (!recoveryMode && (ui.session !== 'ready' || !ui.prompt || !ui.generate || !await isSingleOutputSelected(page))) {
      const accountStatus = ui.session === 'needs_verification' ? 'needs_verification' : ui.session === 'needs_login' ? 'needs_login' : 'unavailable';
      await failJob(job, ui.limitation ?? `Flow preflight: ${ui.session}`, accountStatus); return;
    }
    let outputId: string | null = null;
    let readinessDeadline = Date.now() + flowConfig.generationTimeoutMs;
    if (job.generateIntentAt) {
      console.log(JSON.stringify({ event: 'flow_download_recovery', jobId: job.id, generateIntentAt: job.generateIntentAt }));
      const baselineIds = new Set(job.baselineOutputIds ?? []);
      if (!baselineIds.size) { await failJob(job, 'Recovery thiếu baseline output IDs; không chọn output cũ và không Generate lại.'); return; }
      const persistedOutputId = job.flowDetailId && !baselineIds.has(job.flowDetailId)
        ? job.flowDetailId
        : null;
      const recoveryDeadline = readinessDeadline;
      let lastProbe = '';
      while (Date.now() < recoveryDeadline && !outputId) {
        const outputIds = await getFlowOutputIds(page);
        const newIds = persistedOutputId
          ? [persistedOutputId]
          : findNewFlowOutputIds([...baselineIds], outputIds);
        if (newIds.length > 1) throw new Error(`FLOW_RECOVERY_OUTPUT_AMBIGUOUS:${newIds.length}`);
        const detailOpened = newIds.length === 1 && await openFlowOutputById(page, newIds[0]!);
        if (detailOpened) outputId = newIds[0]!;
        const probe = `${outputIds.length}:${newIds.length}:${detailOpened}`;
        if (probe !== lastProbe) {
          console.log(JSON.stringify({ event: 'flow_recovery_probe', jobId: job.id, outputCount: outputIds.length, newOutputCount: newIds.length, detailOpened }));
          lastProbe = probe;
        }
        if (!outputId) await page.waitForTimeout(2_000);
      }
    } else {
      await firestore.collection('flowJobs').doc(job.id).update({ stage: 'filling_prompt', updatedAt: new Date().toISOString() });
      await ui.prompt!.locator.fill(job.prompt);
      const baselineOutputIds = await getStableFlowOutputIds(page);
      const intentAt = new Date().toISOString();
      await firestore.collection('flowJobs').doc(job.id).update({
        generateIntentAt: intentAt,
        generateClicks: 0,
        generateInputMethod: 'playwright',
        executionEngine: 'playwright_fallback',
        baselineOutputIds,
        updatedAt: intentAt,
      });
      await ui.generate!.locator.click();
      await firestore.collection('flowJobs').doc(job.id).update({
        generateClicks: 1,
        stage: 'generating',
        updatedAt: new Date().toISOString(),
      });
      const approval = await waitForFlowApprovalControl(page);
      if (approval) {
        await failJob(job, `FLOW_APPROVAL_REQUIRES_VALIDATED_LOCATOR:${approval.key}`);
        return;
      }
      await firestore.collection('flowJobs').doc(job.id).update({ stage: 'waiting_output', updatedAt: new Date().toISOString() });
      readinessDeadline = Date.now() + flowConfig.generationTimeoutMs;
      while (Date.now() < readinessDeadline && !outputId) {
        await page.waitForTimeout(5_000);
        const outputIds = await getFlowOutputIds(page);
        const newIds = findNewFlowOutputIds(baselineOutputIds, outputIds);
        if (newIds.length > 1) throw new Error(`FLOW_OUTPUT_AMBIGUOUS:${newIds.length}`);
        if (newIds.length === 1 && await openFlowOutputById(page, newIds[0]!)) {
          job.flowDetailId = newIds[0]!;
          await firestore.collection('flowJobs').doc(job.id).update({ flowDetailId: job.flowDetailId, updatedAt: new Date().toISOString() });
          outputId = job.flowDetailId;
        }
      }
    }
    if (!outputId) { await failJob(job, 'FLOW_OUTPUT_NOT_DETECTED_TIMEOUT'); return; }
    await page.setViewportSize({ width: 1_440, height: 900 });
    await page.waitForTimeout(500);
    const stageMap = {
      OUTPUT_DETECTED: 'output_detected', OUTPUT_RENDERING: 'output_rendering',
      OUTPUT_READY: 'output_ready', DOWNLOAD_READY: 'download_ready', DOWNLOAD: 'downloading',
    } as const;
    const readinessResult = await runDownloadReadinessStateMachine<LocatedControl>({
      deadlineAt: readinessDeadline,
      pollIntervalMs: 5_000,
      probe: async () => {
        if (!page.url().includes(`/edit/${outputId}`) && !await openFlowOutputById(page, outputId)) {
          return { state: 'OUTPUT_FAILED', control: null, failureText: 'FLOW_OUTPUT_ID_MISMATCH' };
        }
        const readiness = await inspectFlowDownloadReadiness(page);
        console.log(JSON.stringify({
          event: 'flow_download_readiness', jobId: job.id, outputId,
          state: readiness.state, control: readiness.control?.key ?? null,
          enabled: readiness.enabled, disabledAttribute: readiness.disabledAttribute,
          ariaDisabled: readiness.ariaDisabled,
        }));
        return readiness;
      },
      wait: (milliseconds) => page.waitForTimeout(milliseconds),
      onState: async (state) => {
        await firestore.collection('flowJobs').doc(job.id).update({
          stage: stageMap[state], updatedAt: new Date().toISOString(),
        });
      },
      download: async (control) => {
        await control.locator.scrollIntoViewIfNeeded();
        downloadedPath = pathInsideWorkspace(loadLocalAgentConfig(), flowJobTempRelativePath(job));
        await downloadThroughFlowUi(page, control, downloadedPath);
      },
    });
    const readinessFailure = downloadReadinessFailure(readinessResult);
    if (readinessFailure) { await failJob(job, readinessFailure.error); return; }
    if (job.storageStrategy === 'firebase') {
      const uploaded = await uploadVideo(job, downloadedPath);
      await unlink(downloadedPath); downloadedPath = '';
      console.log(JSON.stringify({ event: 'flow_job_succeeded', jobId: job.id, accountId: job.flowAccountId, assetId: uploaded.assetId, storageType: 'firebase', storagePath: uploaded.storagePath }));
    } else {
      const localAsset = await persistLocalVideo(job, downloadedPath);
      downloadedPath = '';
      console.log(JSON.stringify({ event: 'flow_job_succeeded', jobId: job.id, accountId: job.flowAccountId, assetId: localAsset.id, storageType: 'local', relativePath: localAsset.relativePath }));
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const screenshotPath = pathInsideDataRoot('errors', `${job.id}-${Date.now()}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: false }).catch(() => undefined);
    await failJob(job, `Flow Worker dừng an toàn: ${detail}`);
  } finally {
    await session.close().catch(() => undefined);
    if (downloadedPath) console.log(JSON.stringify({ event: 'flow_file_retained', jobId: job.id, path: downloadedPath }));
  }
}

export async function runWorker(): Promise<void> {
  ensureLocalDirectories();
  await markInterruptedJobs();
  console.log('FLOW_WORKER_READY single_job=true parallel=false auto_retry=false');
  while (true) {
    const job = await nextQueuedJob();
    if (job) await processPlaywrightJob(job); else await sleep(flowConfig.pollIntervalMs);
  }
}
