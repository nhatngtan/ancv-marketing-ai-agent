import { Router } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import {
  PLATFORMS,
  aggregatePublishingStatus,
  type ContentRecord,
  type MediaAssetRecord,
  type PlatformPublication,
  type PublishingJobRecord,
} from '@ancv/shared';
import { z } from 'zod';
import { db, storageBucket } from '../firebase.js';
import { getPublishingProvider } from '../connectors/registry.js';
import { decideRetry } from '../services/retry-policy.js';
import { requireAutomationIdentity, requireFirebaseEditor } from '../middleware/auth.js';
import { config } from '../config.js';
import { createWordPressDraftUat } from '../services/wordpress-draft.js';

export const publishingRouter = Router();

publishingRouter.post('/wordpress/:contentId/draft', requireFirebaseEditor, async (request, response, next) => {
  try {
    const result = await createWordPressDraftUat(String(request.params.contentId), response.locals.identity.uid);
    response.status(result.idempotentReplay ? 200 : 201).json(result);
  } catch (error) { next(error); }
});

const manualSchema = z.object({
  postUrl: z.string().url().optional(),
  platformPostId: z.string().max(200).optional(),
  publishedAt: z.iso.datetime(),
  note: z.string().max(2000).optional(),
});

const youtubeStartSchema = z.object({
  confirmPrivate: z.literal(true),
  idempotencyKey: z.string().uuid(),
});

export function youtubeJobId(contentDocId: string): string {
  return `youtube-${contentDocId}`;
}

function updatePublication(
  current: PlatformPublication[],
  platform: PlatformPublication['platform'],
  changes: Partial<PlatformPublication>,
): PlatformPublication[] {
  const found = current.some((item) => item.platform === platform);
  if (!found) return [...current, { platform, mode: 'manual', status: 'manual_pending', ...changes }];
  return current.map((item) => item.platform === platform ? { ...item, ...changes } : item);
}

function httpError(message: string, statusCode: number): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode });
}

async function loadYouTubePublishInput(contentDocId: string): Promise<{
  content: ContentRecord;
  asset: MediaAssetRecord;
  title: string;
  body: string;
}> {
  const contentSnapshot = await db().collection('contents').doc(contentDocId).get();
  if (!contentSnapshot.exists) throw httpError('CONTENT_NOT_FOUND', 404);
  const content = contentSnapshot.data() as ContentRecord;
  if (content.type !== 'video') throw httpError('YOUTUBE_VIDEO_CONTENT_REQUIRED', 400);
  if (!content.finalVideoAssetId) throw httpError('YOUTUBE_FINAL_REQUIRED', 409);
  const assetSnapshot = await db().collection('mediaAssets').doc(content.finalVideoAssetId).get();
  if (!assetSnapshot.exists) throw httpError('YOUTUBE_FINAL_NOT_FOUND', 409);
  const asset = assetSnapshot.data() as MediaAssetRecord;
  assertYouTubePublishEligibility(content, asset);
  const copy = content.platformCopies!.youtube!;
  const title = copy.title?.trim() || content.title.trim();
  if (!title || !copy.text.trim()) throw httpError('YOUTUBE_COPY_INVALID', 409);
  return { content, asset, title, body: copy.text };
}

export function assertYouTubePublishEligibility(content: ContentRecord, asset: MediaAssetRecord): void {
  if (asset.kind !== 'video_final' || asset.storageType !== 'local' || !asset.relativePath) {
    throw httpError('YOUTUBE_LOCAL_FINAL_REQUIRED', 409);
  }
  const copy = content.platformCopies?.youtube;
  if (!copy || copy.status !== 'approved') throw httpError('YOUTUBE_COPY_APPROVAL_REQUIRED', 409);
  if (!content.approvedAt || !['approved', 'ready_to_publish', 'partially_published', 'published'].includes(content.status)) {
    throw httpError('YOUTUBE_CONTENT_APPROVAL_REQUIRED', 409);
  }
}

publishingRouter.post('/youtube/:contentId/private', requireFirebaseEditor, async (request, response, next) => {
  try {
    const input = youtubeStartSchema.parse(request.body);
    const { content, asset } = await loadYouTubePublishInput(String(request.params.contentId));
    if (config.youtubeChannelId !== 'UCy-H7__UvdWcTbUax3RGDcA') throw httpError('YOUTUBE_CHANNEL_CONFIGURATION_MISMATCH', 409);
    const jobId = youtubeJobId(content.id);
    const jobRef = db().collection('publishingJobs').doc(jobId);
    const existing = await jobRef.get();
    if (existing.exists) {
      const job = existing.data() as PublishingJobRecord;
      response.json({ job, idempotentReplay: true });
      return;
    }
    const now = new Date().toISOString();
    const extension = asset.fileName.toLowerCase().match(/\.(mp4|mov|m4v|webm)$/)?.[0] ?? '.mp4';
    const stagingPath = `publishing-staging/youtube/${jobId}/${asset.checksumSha256?.slice(0, 24) ?? asset.id}${extension}`;
    const commandRef = db().collection('localCommands').doc();
    const job: PublishingJobRecord = {
      id: jobId,
      platform: 'youtube',
      contentDocId: content.id,
      contentId: content.contentId,
      assetId: asset.id,
      idempotencyKey: input.idempotencyKey,
      privacyStatus: 'private',
      status: 'staging',
      stagingPath,
      stagingCleanup: 'pending',
      error: null,
      createdAt: now,
      updatedAt: now,
      createdBy: response.locals.identity.uid,
    };
    const batch = db().batch();
    batch.create(jobRef, job);
    batch.create(commandRef, {
      id: commandRef.id,
      agentId: 'ancv-windows-01',
      command: 'stage_youtube_final',
      status: 'queued',
      contentDocId: content.id,
      contentId: content.contentId,
      relativePath: asset.relativePath,
      publishingJobId: jobId,
      stagingPath,
      createdAt: now,
      updatedAt: now,
      createdBy: response.locals.identity.uid,
      error: null,
    });
    await batch.commit();
    response.status(202).json({ job, commandId: commandRef.id, idempotentReplay: false });
  } catch (error) { next(error); }
});

publishingRouter.get('/youtube/jobs/:jobId', requireFirebaseEditor, async (request, response, next) => {
  try {
    const snapshot = await db().collection('publishingJobs').doc(String(request.params.jobId)).get();
    if (!snapshot.exists) throw httpError('PUBLISHING_JOB_NOT_FOUND', 404);
    response.json({ job: snapshot.data() as PublishingJobRecord });
  } catch (error) { next(error); }
});

publishingRouter.post('/youtube/jobs/:jobId/execute', requireFirebaseEditor, async (request, response, next) => {
  try {
    const jobRef = db().collection('publishingJobs').doc(String(request.params.jobId));
    const claimed = await db().runTransaction(async (transaction) => {
      const snapshot = await transaction.get(jobRef);
      if (!snapshot.exists) throw httpError('PUBLISHING_JOB_NOT_FOUND', 404);
      const job = snapshot.data() as PublishingJobRecord;
      if (job.status === 'succeeded') return { job, replay: true };
      if (job.status !== 'staged' || !job.stagingPath) throw httpError('YOUTUBE_STAGING_NOT_READY', 409);
      const now = new Date().toISOString();
      transaction.update(jobRef, { status: 'uploading', uploadIntentAt: now, updatedAt: now, error: null });
      return { job: { ...job, status: 'uploading' as const, uploadIntentAt: now }, replay: false };
    });
    if (claimed.replay) {
      response.json({ job: claimed.job, idempotentReplay: true });
      return;
    }
    const { content, title, body } = await loadYouTubePublishInput(claimed.job.contentDocId);
    const result = await getPublishingProvider('youtube').publish({
      idempotencyKey: claimed.job.idempotencyKey,
      contentId: content.id,
      title,
      body,
      mediaUrls: [],
      stagingPath: claimed.job.stagingPath,
      privacyStatus: 'private',
    });
    const now = new Date().toISOString();
    if (!result.success || !result.platformPostId || result.channelId !== config.youtubeChannelId || result.privacyStatus !== 'private') {
      await jobRef.update({
        status: 'needs_manual',
        error: result.errorCode ?? result.message,
        platformPostId: result.platformPostId ?? null,
        updatedAt: now,
      });
      const currentPlatforms = content.platforms ?? [];
      await db().collection('contents').doc(content.id).update({
        platforms: updatePublication(currentPlatforms, 'youtube', { status: 'needs_action', lastError: result.message }),
        updatedAt: now,
      });
      response.status(202).json({ job: { ...claimed.job, status: 'needs_manual', error: result.message }, result });
      return;
    }
    let stagingCleanup: 'completed' | 'failed' = 'completed';
    try {
      await storageBucket().file(claimed.job.stagingPath!).delete({ ignoreNotFound: true });
      const [exists] = await storageBucket().file(claimed.job.stagingPath!).exists();
      if (exists) stagingCleanup = 'failed';
    } catch { stagingCleanup = 'failed'; }
    const platforms = updatePublication(content.platforms ?? [], 'youtube', {
      status: 'published',
      mode: 'semi_automatic',
      platformPostId: result.platformPostId,
      postUrl: result.postUrl,
      publishedAt: now,
      note: 'YouTube API — Riêng tư',
      lastError: undefined,
    });
    const status = aggregatePublishingStatus(platforms);
    const completed: Partial<PublishingJobRecord> = {
      status: 'succeeded',
      videoId: result.platformPostId,
      postUrl: result.postUrl,
      channelId: result.channelId,
      stagingCleanup,
      completedAt: now,
      updatedAt: now,
      error: null,
    };
    const batch = db().batch();
    batch.update(jobRef, completed);
    batch.update(db().collection('contents').doc(content.id), { platforms, status, updatedAt: now });
    await batch.commit();
    response.json({ job: { ...claimed.job, ...completed }, result, idempotentReplay: false });
  } catch (error) { next(error); }
});

publishingRouter.post('/jobs/:jobId/manual-complete', requireFirebaseEditor, async (request, response, next) => {
  try {
    const input = manualSchema.parse(request.body);
    const jobId = String(request.params.jobId);
    await db().collection('publishingJobs').doc(jobId).set({
      ...input,
      status: 'published',
      mode: 'manual',
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    response.json({ ok: true, jobId, status: 'published' });
  } catch (error) { next(error); }
});

publishingRouter.post('/tasks/publish', requireAutomationIdentity, async (request, response, next) => {
  try {
    const input = z.object({
      jobId: z.string().min(1), platform: z.enum(PLATFORMS), contentId: z.string(),
      title: z.string(), body: z.string(), mediaUrls: z.array(z.string().url()).default([]),
      idempotencyKey: z.string().min(8), attempt: z.number().int().min(1).default(1),
    }).parse(request.body);
    const jobRef = db().collection('publishingJobs').doc(input.jobId);
    const job = await jobRef.get();
    if (job.data()?.idempotencyKey === input.idempotencyKey && job.data()?.status === 'published') {
      response.json({ ok: true, idempotentReplay: true }); return;
    }
    const result = await getPublishingProvider(input.platform).publish(input);
    if (result.success) {
      await jobRef.set({ ...result, idempotencyKey: input.idempotencyKey, status: 'published', updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      response.json({ ok: true, result }); return;
    }
    const failureKind = result.errorCode === 'MANUAL_REQUIRED' ? 'permission' : 'unknown';
    const decision = decideRetry(failureKind, input.attempt);
    await jobRef.set({ ...result, retryDecision: decision, idempotencyKey: input.idempotencyKey, status: decision.nextState, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    response.status(decision.retry ? 503 : 202).json({ ok: false, result, decision });
  } catch (error) { next(error); }
});
