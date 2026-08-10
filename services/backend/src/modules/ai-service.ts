import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import type { ContentRecord, Platform, PlatformCopy, SceneRecord } from '@ancv/shared';
import { db, storageBucket } from '../firebase.js';
import { requireAIRateLimit, requireAutomationIdentity, requireFirebaseEditor } from '../middleware/auth.js';
import { openAIProvider } from '../services/openai-provider.js';
import { getCompletedAIJob, runAIJob } from '../services/ai-job.js';
import { loadCompanyProfile } from './content-service.js';

export const aiRouter = Router();
const jobInput = z.object({ idempotencyKey: z.string().min(8).max(200), replaceExisting: z.boolean().default(false) });
const platformSchema = z.enum(['youtube','facebook','tiktok','linkedin','zalo','website']);

async function contentOrThrow(contentDocId: string): Promise<ContentRecord> {
  const snapshot = await db().collection('contents').doc(contentDocId).get();
  if (!snapshot.exists) throw Object.assign(new Error('CONTENT_NOT_FOUND'), { statusCode: 404 });
  return { id: snapshot.id, ...snapshot.data() } as ContentRecord;
}

aiRouter.get('/health', async (_request, response) => {
  const configured = openAIProvider.getHealth();
  if (configured.status !== 'operational') { response.json(configured); return; }
  const snapshot = await db().collection('systemSettings').doc('openai').get();
  const liveStatus = snapshot.data()?.status === 'available' ? 'operational' : snapshot.data()?.status === 'error' ? 'error' : 'configured_untested';
  response.json({ ...configured, status: liveStatus, testedAt: snapshot.data()?.testedAt ?? null });
});

aiRouter.post('/smoke-test', requireAutomationIdentity, async (request, response, next) => {
  const testedBy = response.locals.identity?.email ?? 'automation';
  let includeImage: boolean;
  try { includeImage = z.object({ includeImage: z.boolean().default(false) }).parse(request.body).includeImage; }
  catch (error) { next(error); return; }
  try {
    const evidence = await openAIProvider.smokeTest(includeImage); const settingRef = db().collection('systemSettings').doc('openai'); const existing = (await settingRef.get()).data();
    const imageAlreadyPassed = !includeImage && existing?.imageApi === 'available' && existing?.evidence?.image?.status === 'passed'; if (imageAlreadyPassed) evidence.image = existing.evidence.image;
    const record = { id: 'openai', status: includeImage || imageAlreadyPassed ? 'available' : 'partially_available', responsesApi: 'available', imageApi: includeImage || imageAlreadyPassed ? 'available' : 'not_tested', testedAt: evidence.checkedAt, testedBy, updatedAt: evidence.checkedAt, models: { text: evidence.text.model, image: evidence.image.model }, evidence, lastError: null };
    await settingRef.set(record, { merge: true }); request.log.info({ event: 'openai_usage', testedBy, status: record.status, evidence }); response.json(record);
  } catch (error) {
    const now = new Date().toISOString(); const upstream = error as { status?: number; requestID?: string; code?: string; name?: string };
    await db().collection('systemSettings').doc('openai').set({ id: 'openai', status: 'error', testedAt: now, testedBy, updatedAt: now, lastError: { type: upstream.name ?? 'Error', status: upstream.status ?? null, code: upstream.code ?? null, requestId: upstream.requestID ?? null } }, { merge: true });
    request.log.error({ event: 'openai_smoke_failed', testedBy, errorType: upstream.name, status: upstream.status, code: upstream.code, requestId: upstream.requestID }); next(error);
  }
});

aiRouter.use(requireFirebaseEditor);

aiRouter.get('/usage/month', async (_request, response, next) => {
  try {
    const start = new Date(); start.setUTCDate(1); start.setUTCHours(0,0,0,0);
    const snapshot = await db().collection('aiUsage').where('createdAt', '>=', start.toISOString()).get();
    const records = snapshot.docs.map((item) => item.data());
    response.json({ month: start.toISOString().slice(0,7), requests: records.length, inputTokens: records.reduce((sum,item) => sum + Number(item.inputTokens ?? 0),0), outputTokens: records.reduce((sum,item) => sum + Number(item.outputTokens ?? 0),0), totalTokens: records.reduce((sum,item) => sum + Number(item.totalTokens ?? 0),0), images: records.reduce((sum,item) => sum + Number(item.imageCount ?? 0),0) });
  } catch (error) { next(error); }
});

aiRouter.use(requireAIRateLimit);

aiRouter.post('/content/:contentId/scenes/breakdown', async (request, response, next) => {
  try {
    const input = jobInput.parse(request.body); const uid = response.locals.identity.uid; const content = await contentOrThrow(request.params.contentId);
    if (content.type !== 'video' || !content.masterScript || content.masterScript.trim().length < 30) { response.status(400).json({ error: 'MASTER_SCRIPT_REQUIRED' }); return; }
    const completed = await getCompletedAIJob<SceneRecord[]>(uid, 'scene_breakdown', input.idempotencyKey); if (completed) { response.json({ jobId: completed.jobId, duplicate: true, scenes: completed.result }); return; }
    const existing = await db().collection('scenes').where('contentDocId', '==', content.id).get();
    if (!existing.empty && !input.replaceExisting) { response.status(409).json({ error: 'SCENES_EXIST_CONFIRM_REPLACE' }); return; }
    const profile = await loadCompanyProfile();
    const job = await runAIJob({ uid, operation: 'scene_breakdown', contentDocId: content.id, idempotencyKey: input.idempotencyKey, execute: async () => {
      const result = await openAIProvider.splitScenes({ masterScript: content.masterScript!, topic: content.topic, profile, visualStyle: content.visualStyle, characters: content.characterReferences });
      return { data: result.data, model: result.model, requestId: result.requestId, usage: result.usage };
    }});
    if (!job.duplicate) {
      const batch = db().batch(); existing.docs.forEach((item) => batch.delete(item.ref)); const now = new Date().toISOString();
      job.result.forEach((scene) => { const ref = db().collection('scenes').doc(); batch.set(ref, { id: ref.id, contentDocId: content.id, ...scene, createdAt: now, updatedAt: now, createdBy: uid }); });
      batch.update(db().collection('contents').doc(content.id), { status: 'in_production', updatedAt: now }); await batch.commit();
    }
    response.json({ jobId: job.jobId, duplicate: job.duplicate, scenes: job.result });
  } catch (error) { next(error); }
});

aiRouter.post('/content/:contentId/scenes/:sceneId/regenerate', async (request, response, next) => {
  try {
    const input = jobInput.pick({ idempotencyKey: true }).parse(request.body); const uid = response.locals.identity.uid; const content = await contentOrThrow(request.params.contentId); const sceneRef = db().collection('scenes').doc(request.params.sceneId); const snapshot = await sceneRef.get();
    if (!snapshot.exists || snapshot.data()?.contentDocId !== content.id) { response.status(404).json({ error: 'SCENE_NOT_FOUND' }); return; }
    const profile = await loadCompanyProfile(); const current = snapshot.data() as SceneRecord;
    const job = await runAIJob({ uid, operation: 'scene_regeneration', contentDocId: content.id, idempotencyKey: input.idempotencyKey, execute: async () => { const result = await openAIProvider.regenerateScene({ masterScript: content.masterScript ?? '', topic: content.topic, scene: current, profile, visualStyle: content.visualStyle, characters: content.characterReferences }); return { data: result.data, model: result.model, requestId: result.requestId, usage: result.usage }; } });
    if (!job.duplicate) await sceneRef.update({ ...job.result, sceneNumber: current.sceneNumber, createdAt: current.createdAt, createdBy: current.createdBy, updatedAt: new Date().toISOString() });
    response.json({ jobId: job.jobId, duplicate: job.duplicate, scene: job.result });
  } catch (error) { next(error); }
});

aiRouter.post('/content/:contentId/scenes/:sceneId/prompt', async (request, response, next) => {
  try {
    const input = jobInput.pick({ idempotencyKey: true }).parse(request.body); const uid = response.locals.identity.uid; const content = await contentOrThrow(request.params.contentId); const sceneRef = db().collection('scenes').doc(request.params.sceneId); const snapshot = await sceneRef.get();
    if (!snapshot.exists || snapshot.data()?.contentDocId !== content.id) { response.status(404).json({ error: 'SCENE_NOT_FOUND' }); return; }
    const profile = await loadCompanyProfile(); const current = snapshot.data() as SceneRecord;
    const job = await runAIJob({ uid, operation: 'flow_prompt', contentDocId: content.id, idempotencyKey: input.idempotencyKey, execute: async () => { const result = await openAIProvider.generateFlowPrompt({ masterScript: content.masterScript ?? '', scene: current, profile, visualStyle: content.visualStyle, characters: content.characterReferences }); return { data: result.data, model: result.model, requestId: result.requestId, usage: result.usage }; } });
    if (!job.duplicate) await sceneRef.update({ generationPrompt: job.result, status: 'draft', updatedAt: new Date().toISOString() }); response.json({ jobId: job.jobId, duplicate: job.duplicate, generationPrompt: job.result });
  } catch (error) { next(error); }
});

aiRouter.post('/content/:contentId/platform-copy/:platform', async (request, response, next) => {
  try {
    const input = jobInput.parse(request.body); const platform = platformSchema.parse(request.params.platform) as Platform; const uid = response.locals.identity.uid; const content = await contentOrThrow(request.params.contentId);
    const allowed: Platform[] = content.type === 'video' ? ['youtube','tiktok','facebook','zalo','linkedin'] : ['website','facebook','zalo','linkedin'];
    if (!allowed.includes(platform)) { response.status(400).json({ error: 'PLATFORM_NOT_ALLOWED' }); return; }
    const operation = content.type === 'video' ? 'video_social_copy' as const : 'article_platform_copy' as const; const completed = await getCompletedAIJob<PlatformCopy>(uid, operation, input.idempotencyKey); if (completed) { response.json({ jobId: completed.jobId, duplicate: true, copy: completed.result }); return; }
    const current = content.platformCopies?.[platform]; if (current && !input.replaceExisting) { response.status(409).json({ error: 'COPY_EXISTS_CONFIRM_REGENERATE' }); return; }
    const source = content.type === 'video' ? `${content.masterScript ?? ''}\n${content.body ?? ''}` : content.body;
    if (!source?.trim()) { response.status(400).json({ error: 'SOURCE_CONTENT_REQUIRED' }); return; }
    const profile = await loadCompanyProfile();
    const job = await runAIJob({ uid, operation, contentDocId: content.id, idempotencyKey: input.idempotencyKey, execute: async () => { const result = await openAIProvider.generatePlatformCopy({ source, topic: content.topic, platform, contentType: content.type, profile }); const copy: PlatformCopy = { platform, title: result.data.title || undefined, text: result.data.text, status: 'draft', generatedAt: new Date().toISOString(), generatedBy: uid, version: (current?.version ?? 0) + 1 }; return { data: copy, model: result.model, requestId: result.requestId, usage: result.usage }; } });
    if (!job.duplicate) await db().collection('contents').doc(content.id).update({ [`platformCopies.${platform}`]: job.result, status: 'review', updatedAt: new Date().toISOString() }); response.json({ jobId: job.jobId, duplicate: job.duplicate, copy: job.result });
  } catch (error) { next(error); }
});

aiRouter.post('/content/:contentId/article', async (request, response, next) => {
  try {
    const input = jobInput.parse(request.body); const uid = response.locals.identity.uid; const content = await contentOrThrow(request.params.contentId); if (content.type !== 'article') { response.status(400).json({ error: 'ARTICLE_REQUIRED' }); return; }
    const completed = await getCompletedAIJob<{title:string;body:string}>(uid, 'article_generation', input.idempotencyKey); if (completed) { response.json({ jobId: completed.jobId, duplicate: true, article: completed.result }); return; }
    if (content.body?.trim() && !input.replaceExisting) { response.status(409).json({ error: 'ARTICLE_EXISTS_CONFIRM_REGENERATE' }); return; }
    const profile = await loadCompanyProfile();
    const job = await runAIJob({ uid, operation: 'article_generation', contentDocId: content.id, idempotencyKey: input.idempotencyKey, execute: async () => { const result = await openAIProvider.writeArticle({ topic: content.topic, objective: content.objective, emphasis: content.shortDescription, sourceMaterial: content.sourceMaterial, notes: content.notes, desiredLength: content.desiredLength, profile }); return { data: result.data, model: result.model, requestId: result.requestId, usage: result.usage }; } });
    if (!job.duplicate) await db().collection('contents').doc(content.id).update({ body: job.result.body, articleGeneratedTitle: job.result.title, status: 'review', updatedAt: new Date().toISOString() }); response.json({ jobId: job.jobId, duplicate: job.duplicate, article: job.result });
  } catch (error) { next(error); }
});

aiRouter.post('/content/:contentId/images', async (request, response, next) => {
  try {
    const input = jobInput.pick({ idempotencyKey: true }).extend({ prompt: z.string().min(10).max(8_000), size: z.enum(['1024x1024','1024x1536','1536x1024']).default('1024x1024'), quality: z.enum(['low','medium','high']).default('low') }).parse(request.body);
    const uid = response.locals.identity.uid; const content = await contentOrThrow(request.params.contentId); if (content.type !== 'article') { response.status(400).json({ error: 'ARTICLE_REQUIRED' }); return; }
    const job = await runAIJob({ uid, operation: 'image_generation', contentDocId: content.id, idempotencyKey: input.idempotencyKey, execute: async () => {
      const result = await openAIProvider.generateImage({ prompt: input.prompt, size: input.size, quality: input.quality }); const buffer = Buffer.from(result.data.base64, 'base64'); const fileName = `${randomUUID()}.png`; const storagePath = `content/${content.id}/ai-images/${fileName}`; const token = randomUUID(); const file = storageBucket().file(storagePath);
      await file.save(buffer, { resumable: false, contentType: 'image/png', metadata: { metadata: { firebaseStorageDownloadTokens: token, contentDocId: content.id } } });
      const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(storageBucket().name)}/o/${encodeURIComponent(storagePath)}?alt=media&token=${token}`; const now = new Date().toISOString(); const assetRef = db().collection('mediaAssets').doc();
      const asset = { id: assetRef.id, contentDocId: content.id, contentId: content.contentId, kind: 'article_image', storagePath, downloadUrl, fileName, contentType: 'image/png', sizeBytes: buffer.byteLength, prompt: input.prompt, model: result.model, quality: input.quality, usage: result.usage, selected: false, status: 'ready', createdAt: now, updatedAt: now, createdBy: uid };
      await assetRef.set(asset); return { data: asset, model: result.model, requestId: result.requestId, usage: result.usage, imageCount: 1 };
    }}); response.status(201).json({ jobId: job.jobId, duplicate: job.duplicate, asset: job.result });
  } catch (error) { next(error); }
});

aiRouter.post('/content/:contentId/platform-copy/:platform/approve', async (request, response, next) => {
  try { const platform = platformSchema.parse(request.params.platform); const content = await contentOrThrow(request.params.contentId); const copy = content.platformCopies?.[platform]; if (!copy) { response.status(404).json({ error: 'COPY_NOT_FOUND' }); return; } const now = new Date().toISOString(); const approved = { ...copy, status: 'approved', approvedAt: now, approvedBy: response.locals.identity.uid }; await db().collection('contents').doc(content.id).update({ [`platformCopies.${platform}`]: approved, updatedAt: now }); response.json({ copy: approved }); }
  catch (error) { next(error); }
});
