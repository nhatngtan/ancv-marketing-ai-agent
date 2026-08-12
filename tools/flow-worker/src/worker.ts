import { randomUUID } from 'node:crypto';
import { mkdir, readdir, rename, stat, unlink } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import type { FlowAccountRecord, FlowJobRecord } from '@ancv/shared';
import { connectAccountContext } from './browser.js';
import { ensureLocalDirectories, flowConfig, loadLocalAgentConfig, pathInsideDataRoot, pathInsideWorkspace } from './config.js';
import { firestore, storageBucket } from './firebase.js';
import { detectGoogleAccountEmail, findDownloadControl, findNewFlowOutputIds, getFlowOutputIds, getStableFlowOutputIds, inspectFlowUi, isSingleOutputSelected, openExistingFlowProject, openFlowOutputById, waitForFlowUi } from './flow-ui.js';
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

async function downloadThroughFlowUi(
  page: Awaited<ReturnType<typeof connectAccountContext>>['page'],
  control: NonNullable<Awaited<ReturnType<typeof findDownloadControl>>>,
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
    batch.update(document.ref, { status: 'needs_manual', error: 'Worker restart khi job đang xử lý; không tự Generate lại.', updatedAt: now });
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
    transaction.update(ref, { status: 'processing', startedAt: now, updatedAt: now, workerInstanceId: process.pid });
    transaction.update(firestore.collection('scenes').doc(job.sceneId), { flowStatus: 'processing', updatedAt: now });
    return { ...job, status: 'processing', startedAt: now, updatedAt: now };
  });
}

async function failJob(job: FlowJobRecord, error: string, accountStatus?: FlowAccountRecord['status']): Promise<void> {
  const now = new Date().toISOString(); const batch = firestore.batch();
  batch.update(firestore.collection('flowJobs').doc(job.id), { status: 'needs_manual', error: error.slice(0, 500), updatedAt: now });
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
  batch.update(firestore.collection('flowJobs').doc(job.id), { status: 'succeeded', assetId: assetRef.id, completedAt: now, updatedAt: now, error: null });
  batch.update(firestore.collection('scenes').doc(job.sceneId), { status: 'used', flowStatus: 'succeeded', lastFlowAssetId: assetRef.id, updatedAt: now });
  await batch.commit();
  return { assetId: assetRef.id, storagePath };
}

export async function processPlaywrightJob(job: FlowJobRecord): Promise<void> {
  const accountSnapshot = await firestore.collection('flowAccounts').doc(job.flowAccountId).get();
  const account = accountSnapshot.data() as FlowAccountRecord | undefined;
  if (!account || account.status !== 'ready') { await failJob(job, 'Tài khoản Flow chưa sẵn sàng.', account?.status ?? 'needs_login'); return; }
  const session = await connectAccountContext(job.flowAccountId);
  const { page } = session;
  let downloadedPath = '';
  try {
    await openExistingFlowProject(page, job.flowProjectUrl, flowConfig.flowUrl);
    const detectedEmail = await detectGoogleAccountEmail(page);
    if (account.email && detectedEmail && account.email.toLowerCase() !== detectedEmail) {
      await failJob(job, `FLOW_ACCOUNT_MISMATCH expected=${account.email} actual=${detectedEmail}`, 'unavailable'); return;
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
    let downloadControl = null;
    if (job.generateIntentAt) {
      console.log(JSON.stringify({ event: 'flow_download_recovery', jobId: job.id, generateIntentAt: job.generateIntentAt }));
      const baselineIds = new Set(job.baselineOutputIds ?? []);
      if (!baselineIds.size) { await failJob(job, 'Recovery thiếu baseline output IDs; không chọn output cũ và không Generate lại.'); return; }
      const persistedOutputId = job.flowDetailId && !baselineIds.has(job.flowDetailId)
        ? job.flowDetailId
        : null;
      const recoveryDeadline = Date.now() + 60_000;
      let lastProbe = '';
      while (Date.now() < recoveryDeadline && !downloadControl) {
        const outputIds = await getFlowOutputIds(page);
        const newIds = persistedOutputId
          ? [persistedOutputId]
          : findNewFlowOutputIds([...baselineIds], outputIds);
        if (newIds.length > 1) throw new Error(`FLOW_RECOVERY_OUTPUT_AMBIGUOUS:${newIds.length}`);
        const detailOpened = newIds.length === 1 && await openFlowOutputById(page, newIds[0]!);
        if (detailOpened) downloadControl = await findDownloadControl(page);
        const probe = `${outputIds.length}:${newIds.length}:${detailOpened}:${downloadControl?.key ?? ''}`;
        if (probe !== lastProbe) {
          console.log(JSON.stringify({ event: 'flow_recovery_probe', jobId: job.id, outputCount: outputIds.length, newOutputCount: newIds.length, detailOpened, downloadControl: downloadControl?.key ?? null }));
          lastProbe = probe;
        }
        if (!downloadControl) await page.waitForTimeout(2_000);
      }
    } else {
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
        updatedAt: new Date().toISOString(),
      });
      const deadline = Date.now() + flowConfig.generationTimeoutMs;
      while (Date.now() < deadline && !downloadControl) {
        await page.waitForTimeout(5_000);
        const outputIds = await getFlowOutputIds(page);
        const newIds = findNewFlowOutputIds(baselineOutputIds, outputIds);
        if (newIds.length > 1) throw new Error(`FLOW_OUTPUT_AMBIGUOUS:${newIds.length}`);
        if (newIds.length === 1 && await openFlowOutputById(page, newIds[0]!)) {
          job.flowDetailId = newIds[0]!;
          await firestore.collection('flowJobs').doc(job.id).update({ flowDetailId: job.flowDetailId, updatedAt: new Date().toISOString() });
          downloadControl = await findDownloadControl(page);
        }
      }
    }
    if (!downloadControl) { await failJob(job, 'Không xác định được output/download trong timeout; không Generate lại.'); return; }
    await page.setViewportSize({ width: 1_440, height: 900 });
    await page.waitForTimeout(500);
    downloadControl = await findDownloadControl(page);
    if (!downloadControl) throw new Error('FLOW_DOWNLOAD_CONTROL_LOST_AFTER_VIEWPORT_FIX');
    await downloadControl.locator.scrollIntoViewIfNeeded();
    downloadedPath = pathInsideWorkspace(loadLocalAgentConfig(), flowJobTempRelativePath(job));
    await downloadThroughFlowUi(page, downloadControl, downloadedPath);
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
