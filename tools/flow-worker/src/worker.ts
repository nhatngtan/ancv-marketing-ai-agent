import { randomUUID } from 'node:crypto';
import { stat, unlink, writeFile } from 'node:fs/promises';
import { extname } from 'node:path';
import type { FlowAccountRecord, FlowJobRecord } from '@ancv/shared';
import { connectAccountContext } from './browser.js';
import { ensureLocalDirectories, flowConfig, pathInsideDataRoot } from './config.js';
import { firestore, storageBucket } from './firebase.js';
import { countVisibleVideoPreviews, detectGoogleAccountEmail, findDownloadControl, inspectFlowUi, openExistingFlowProject, openLatestVideoDetail, waitForFlowUi } from './flow-ui.js';

const sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

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
  const candidates = snapshot.docs.map((document) => document.data() as FlowJobRecord).sort((left, right) => left.createdAt.localeCompare(right.createdAt));
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

async function processJob(job: FlowJobRecord): Promise<void> {
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
    if (!recoveryMode && (ui.session !== 'ready' || !ui.prompt || !ui.generate)) {
      const accountStatus = ui.session === 'needs_verification' ? 'needs_verification' : ui.session === 'needs_login' ? 'needs_login' : 'unavailable';
      await failJob(job, ui.limitation ?? `Flow preflight: ${ui.session}`, accountStatus); return;
    }
    let downloadControl = null;
    if (job.generateIntentAt) {
      console.log(JSON.stringify({ event: 'flow_download_recovery', jobId: job.id, generateIntentAt: job.generateIntentAt }));
      const recoveryDeadline = Date.now() + 60_000;
      let lastProbe = '';
      while (Date.now() < recoveryDeadline && !downloadControl) {
        const previewCount = await countVisibleVideoPreviews(page);
        const detailOpened = page.url().includes('/edit/')
          || (previewCount > 0 && await openLatestVideoDetail(page));
        if (detailOpened) downloadControl = await findDownloadControl(page);
        const probe = `${previewCount}:${detailOpened}:${page.url().includes('/edit/')}:${downloadControl?.key ?? ''}`;
        if (probe !== lastProbe) {
          console.log(JSON.stringify({ event: 'flow_recovery_probe', jobId: job.id, previewCount, detailOpened, inMediaDetail: page.url().includes('/edit/'), downloadControl: downloadControl?.key ?? null }));
          lastProbe = probe;
        }
        if (!downloadControl) await page.waitForTimeout(2_000);
      }
    } else {
      await ui.prompt!.locator.fill(job.prompt);
      const baselineVideoCount = await countVisibleVideoPreviews(page);
      const intentAt = new Date().toISOString();
      await firestore.collection('flowJobs').doc(job.id).update({ generateIntentAt: intentAt, updatedAt: intentAt });
      await ui.generate!.locator.click();
      const deadline = Date.now() + flowConfig.generationTimeoutMs;
      while (Date.now() < deadline && !downloadControl) {
        await page.waitForTimeout(5_000);
        if (await countVisibleVideoPreviews(page) > baselineVideoCount && await openLatestVideoDetail(page)) downloadControl = await findDownloadControl(page);
      }
    }
    if (!downloadControl) { await failJob(job, 'Không xác định được output/download trong timeout; không Generate lại.'); return; }
    await downloadControl.locator.scrollIntoViewIfNeeded();
    downloadedPath = pathInsideDataRoot('downloads', `${job.contentId}_S${String(job.sceneNumber).padStart(2, '0')}_T01.mp4`);
    try {
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 15_000 }),
        downloadControl.locator.click({ force: true, timeout: 15_000 }),
      ]);
      const extension = extname(download.suggestedFilename()) || '.mp4';
      downloadedPath = pathInsideDataRoot('downloads', `${job.contentId}_S${String(job.sceneNumber).padStart(2, '0')}_T01${extension}`);
      await download.saveAs(downloadedPath);
    } catch {
      const videos = page.locator('video[src]');
      let mediaVideo = videos.first();
      for (let index = 0; index < await videos.count(); index += 1) {
        if (await videos.nth(index).isVisible()) { mediaVideo = videos.nth(index); break; }
      }
      const source = await mediaVideo.getAttribute('src');
      if (!source) throw new Error('FLOW_MEDIA_SOURCE_NOT_FOUND_AFTER_DOWNLOAD_CLICK');
      const response = await page.context().request.get(new URL(source, page.url()).toString(), { timeout: 60_000 });
      const contentType = response.headers()['content-type'] ?? '';
      const contentLength = Number(response.headers()['content-length'] ?? 0);
      if (!response.ok() || (!contentType.startsWith('video/') && contentType !== 'application/octet-stream')) throw new Error(`FLOW_MEDIA_GET_FAILED_${response.status()}`);
      if (contentLength > 1_000_000_000) throw new Error('FLOW_MEDIA_TOO_LARGE');
      const body = await response.body();
      if (body.length < 1_024) throw new Error('FLOW_MEDIA_EMPTY');
      await writeFile(downloadedPath, body);
      console.log(JSON.stringify({ event: 'flow_download_api_fallback', jobId: job.id, bytes: body.length }));
    }
    const uploaded = await uploadVideo(job, downloadedPath);
    await unlink(downloadedPath); downloadedPath = '';
    console.log(JSON.stringify({ event: 'flow_job_succeeded', jobId: job.id, accountId: job.flowAccountId, assetId: uploaded.assetId, storagePath: uploaded.storagePath }));
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
    if (job) await processJob(job); else await sleep(flowConfig.pollIntervalMs);
  }
}
