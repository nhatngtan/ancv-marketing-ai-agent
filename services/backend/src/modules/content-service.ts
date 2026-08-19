import { Router } from 'express';
import { z } from 'zod';
import type { DocumentReference, Firestore } from 'firebase-admin/firestore';
import { CONTENT_MANAGEMENT_CHANNEL_IDS, aggregatePublishingStatus, evaluateArticleSeo, type CompanyProfile, type ContentManagementSettings, type ContentRecord, type MediaAssetRecord, type PlatformPublication } from '@ancv/shared';
import { allocateContentId, createContentWithId } from '../services/content-id.js';
import { requireFirebaseAdmin, requireFirebaseEditor, requireFirebaseUser } from '../middleware/auth.js';
import { db } from '../firebase.js';

export const contentRouter = Router();

const optionalText = (max: number) => z.string().max(max).optional();
const operationFields = {
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  priority: z.enum(['normal', 'high']).optional(),
};
const createContentSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('video'), title: z.string().trim().min(1).max(300), notes: optionalText(10_000), ...operationFields }).strict(),
  z.object({
    type: z.literal('article'), title: z.string().trim().min(1).max(300), topic: z.string().trim().min(1).max(500),
    body: optionalText(100_000), objective: optionalText(5_000), shortDescription: optionalText(5_000),
    sourceMaterial: optionalText(50_000), notes: optionalText(10_000), desiredLength: optionalText(200),
    platforms: z.array(z.enum(['website', 'facebook', 'zalo', 'linkedin'])).min(1).max(4).optional(), ...operationFields,
  }).strict(),
]);
const contentManagementSettingsSchema = z.object({
  enabledChannels: z.array(z.enum(CONTENT_MANAGEMENT_CHANNEL_IDS)).max(CONTENT_MANAGEMENT_CHANNEL_IDS.length),
  customChannels: z.array(z.object({
    id: z.string().regex(/^custom-[a-z0-9][a-z0-9-]{0,47}$/),
    name: z.string().trim().min(1).max(80),
    enabled: z.boolean(),
  }).strict()).max(10),
}).strict().superRefine((value, context) => {
  if (new Set(value.enabledChannels).size !== value.enabledChannels.length) context.addIssue({ code: 'custom', message: 'DUPLICATE_DEFAULT_CHANNEL' });
  if (new Set(value.customChannels.map((item) => item.id)).size !== value.customChannels.length) context.addIssue({ code: 'custom', message: 'DUPLICATE_CUSTOM_CHANNEL' });
});
const defaultContentManagementSettings: ContentManagementSettings = {
  enabledChannels: [...CONTENT_MANAGEMENT_CHANNEL_IDS],
  customChannels: [],
};

const sceneFields = {
  sceneNumber: z.number().int().min(1).max(999), title: z.string().min(1).max(200), durationEstimate: z.number().int().min(1).max(120),
  narration: z.string().max(10_000), visualDescription: z.string().max(5_000), cameraDirection: z.string().max(2_000),
  environment: z.string().max(2_000), characters: z.array(z.string().max(200)).max(20), continuityNotes: z.string().max(3_000),
  generationPrompt: z.string().max(8_000), status: z.enum(['draft','approved','used']),
};
const sceneCreateSchema = z.object(sceneFields).partial().extend({ title: z.string().min(1).max(200) });
const sceneUpdateSchema = z.object(sceneFields).partial().refine((value) => Object.keys(value).length > 0);

function sceneNotFound(): Error & { statusCode: number } {
  return Object.assign(new Error('SCENE_NOT_FOUND'), { statusCode: 404 });
}

export async function requireSceneParent(store: Firestore, contentId: string, sceneId: string): Promise<DocumentReference> {
  const reference = store.collection('scenes').doc(sceneId);
  const snapshot = await reference.get();
  if (!snapshot.exists || snapshot.data()?.contentDocId !== contentId) throw sceneNotFound();
  return reference;
}

export async function updateSceneForContent(store: Firestore, contentId: string, sceneId: string, changes: Record<string, unknown>): Promise<void> {
  const reference = await requireSceneParent(store, contentId, sceneId);
  await reference.update(changes);
}

export async function deleteSceneForContent(store: Firestore, contentId: string, sceneId: string): Promise<void> {
  const reference = await requireSceneParent(store, contentId, sceneId);
  await reference.delete();
}

export async function reorderScenesForContent(store: Firestore, contentId: string, sceneIds: string[], updatedAt: string): Promise<void> {
  const references = sceneIds.map((sceneId) => store.collection('scenes').doc(sceneId));
  const snapshots = await store.getAll(...references);
  if (snapshots.some((snapshot) => !snapshot.exists || snapshot.data()?.contentDocId !== contentId)) throw sceneNotFound();
  const batch = store.batch();
  references.forEach((reference, index) => batch.update(reference, { sceneNumber: index + 1, updatedAt }));
  await batch.commit();
}

async function audit(uid: string, action: string, entityId: string, detail?: Record<string, unknown>) {
  const now = new Date().toISOString(); const ref = db().collection('auditLogs').doc();
  await ref.set({ id: ref.id, status: 'recorded', action, entityType: 'content', entityId, detail: detail ?? {}, createdAt: now, updatedAt: now, createdBy: uid });
}

export async function loadCompanyProfile(): Promise<CompanyProfile> {
  const data = (await db().collection('systemSettings').doc('companyProfile').get()).data() ?? {};
  return {
    companyName: String(data.companyName ?? ''), brandName: String(data.brandName ?? ''), website: String(data.website ?? ''),
    introduction: String(data.introduction ?? ''), services: String(data.services ?? ''), serviceAreas: String(data.serviceAreas ?? ''),
    contact: String(data.contact ?? ''), toneOfVoice: String(data.toneOfVoice ?? ''), defaultCta: String(data.defaultCta ?? ''),
    approvedFacts: String(data.approvedFacts ?? ''), updatedAt: data.updatedAt, updatedBy: data.updatedBy,
  };
}

contentRouter.post('/allocate-id', requireFirebaseEditor, async (request, response, next) => {
  try { const payload = z.object({ type: z.enum(['video', 'article']) }).parse(request.body); response.status(201).json({ contentId: await allocateContentId(payload.type) }); }
  catch (error) { next(error); }
});

contentRouter.post('/', requireFirebaseEditor, async (request, response, next) => {
  try {
    const input = createContentSchema.parse(request.body);
    const content = await createContentWithId(input, response.locals.identity.uid);
    response.status(201).json({ content });
  } catch (error) { next(error); }
});

contentRouter.get('/company-profile', requireFirebaseEditor, async (_request, response, next) => {
  try { response.json(await loadCompanyProfile()); } catch (error) { next(error); }
});

contentRouter.put('/company-profile', requireFirebaseAdmin, async (request, response, next) => {
  try {
    const input = z.object({
      companyName: z.string().max(300), brandName: z.string().max(200), website: z.string().max(500), introduction: z.string().max(10_000),
      services: z.string().max(10_000), serviceAreas: z.string().max(5_000), contact: z.string().max(5_000), toneOfVoice: z.string().max(5_000),
      defaultCta: z.string().max(2_000), approvedFacts: z.string().max(20_000),
    }).parse(request.body);
    const now = new Date().toISOString(); const uid = response.locals.identity.uid;
    await db().collection('systemSettings').doc('companyProfile').set({ id: 'companyProfile', status: 'active', createdAt: now, createdBy: uid, ...input, updatedAt: now, updatedBy: uid }, { merge: true });
    await audit(uid, 'company_profile.update', 'companyProfile'); response.json({ ...input, updatedAt: now, updatedBy: uid });
  } catch (error) { next(error); }
});

contentRouter.get('/content-management-settings', requireFirebaseUser, async (_request, response, next) => {
  try {
    const snapshot = await db().collection('systemSettings').doc('contentManagement').get();
    if (!snapshot.exists) { response.json(defaultContentManagementSettings); return; }
    const data = snapshot.data() ?? {};
    const parsed = contentManagementSettingsSchema.safeParse({
      enabledChannels: data.enabledChannels,
      customChannels: data.customChannels,
    });
    response.json(parsed.success ? { ...parsed.data, updatedAt: data.updatedAt, updatedBy: data.updatedBy } : defaultContentManagementSettings);
  } catch (error) { next(error); }
});

contentRouter.put('/content-management-settings', requireFirebaseEditor, async (request, response, next) => {
  try {
    const input = contentManagementSettingsSchema.parse(request.body);
    const now = new Date().toISOString(); const uid = response.locals.identity.uid as string;
    const reference = db().collection('systemSettings').doc('contentManagement');
    const existing = await reference.get();
    const record = { id: 'contentManagement', status: 'active', ...input, updatedAt: now, updatedBy: uid };
    await reference.set({ ...record, createdAt: existing.data()?.createdAt ?? now, createdBy: existing.data()?.createdBy ?? uid }, { merge: true });
    await audit(uid, 'content_management.settings.update', 'contentManagement', { customChannelCount: input.customChannels.length });
    response.json(record);
  } catch (error) { next(error); }
});

contentRouter.use(requireFirebaseEditor);

contentRouter.get('/:contentId/scenes', async (request, response, next) => {
  try {
    const snapshot = await db().collection('scenes').where('contentDocId', '==', request.params.contentId).get();
    response.json({ scenes: snapshot.docs.map((item) => item.data()).sort((a,b) => a.sceneNumber - b.sceneNumber) });
  } catch (error) { next(error); }
});

contentRouter.post('/:contentId/scenes', async (request, response, next) => {
  try {
    const input = sceneCreateSchema.parse(request.body); const uid = response.locals.identity.uid; const now = new Date().toISOString();
    const existing = await db().collection('scenes').where('contentDocId', '==', request.params.contentId).get();
    const sceneNumber = input.sceneNumber ?? Math.max(0, ...existing.docs.map((item) => Number(item.data().sceneNumber ?? 0))) + 1;
    const ref = db().collection('scenes').doc();
    const record = { id: ref.id, contentDocId: request.params.contentId, sceneNumber, title: input.title, durationEstimate: input.durationEstimate ?? 5, narration: input.narration ?? '', visualDescription: input.visualDescription ?? '', cameraDirection: input.cameraDirection ?? '', environment: input.environment ?? '', characters: input.characters ?? [], continuityNotes: input.continuityNotes ?? '', generationPrompt: input.generationPrompt ?? '', status: input.status ?? 'draft', createdAt: now, updatedAt: now, createdBy: uid };
    await ref.set(record); await audit(uid, 'scene.create', request.params.contentId, { sceneId: ref.id }); response.status(201).json(record);
  } catch (error) { next(error); }
});

contentRouter.patch('/:contentId/scenes/:sceneId', async (request, response, next) => {
  try { const input = sceneUpdateSchema.parse(request.body); const uid = response.locals.identity.uid; await updateSceneForContent(db(), request.params.contentId, request.params.sceneId, { ...input, updatedAt: new Date().toISOString() }); await audit(uid, 'scene.update', request.params.contentId, { sceneId: request.params.sceneId }); response.json({ ok: true }); }
  catch (error) { next(error); }
});

contentRouter.delete('/:contentId/scenes/:sceneId', async (request, response, next) => {
  try { const uid = response.locals.identity.uid; await deleteSceneForContent(db(), request.params.contentId, request.params.sceneId); await audit(uid, 'scene.delete', request.params.contentId, { sceneId: request.params.sceneId }); response.status(204).end(); }
  catch (error) { next(error); }
});

contentRouter.post('/:contentId/scenes/:sceneId/duplicate', async (request, response, next) => {
  try {
    const source = await db().collection('scenes').doc(request.params.sceneId).get(); if (!source.exists || source.data()?.contentDocId !== request.params.contentId) { response.status(404).json({ error: 'SCENE_NOT_FOUND' }); return; }
    const all = await db().collection('scenes').where('contentDocId', '==', request.params.contentId).get(); const uid = response.locals.identity.uid; const now = new Date().toISOString(); const ref = db().collection('scenes').doc();
    const record = { ...source.data(), id: ref.id, sceneNumber: Math.max(0, ...all.docs.map((item) => Number(item.data().sceneNumber ?? 0))) + 1, title: `${source.data()?.title} (bản sao)`, status: 'draft', createdAt: now, updatedAt: now, createdBy: uid };
    await ref.set(record); await audit(uid, 'scene.duplicate', request.params.contentId, { sourceSceneId: request.params.sceneId, sceneId: ref.id }); response.status(201).json(record);
  } catch (error) { next(error); }
});

contentRouter.post('/:contentId/scenes/reorder', async (request, response, next) => {
  try {
    const { sceneIds } = z.object({ sceneIds: z.array(z.string().min(1)).min(1).max(120) }).parse(request.body); const now = new Date().toISOString();
    await reorderScenesForContent(db(), request.params.contentId, sceneIds, now); await audit(response.locals.identity.uid, 'scene.reorder', request.params.contentId, { count: sceneIds.length }); response.json({ ok: true });
  } catch (error) { next(error); }
});

contentRouter.post('/:contentId/approve', async (request, response, next) => {
  try {
    const uid = response.locals.identity.uid; const now = new Date().toISOString(); const contentRef = db().collection('contents').doc(request.params.contentId); const snapshot = await contentRef.get();
    if (!snapshot.exists) { response.status(404).json({ error: 'CONTENT_NOT_FOUND' }); return; }
    const content = { id: snapshot.id, ...snapshot.data() } as ContentRecord;
    if (content.type === 'article') {
      const selectedImage = content.selectedImageId ? await db().collection('mediaAssets').doc(content.selectedImageId).get() : null;
      const image = selectedImage?.exists ? selectedImage.data() as MediaAssetRecord : undefined;
      const quality = evaluateArticleSeo({ seo: content.articleSeo, body: content.body, selectedImageAltText: image?.altText });
      const failed = quality.checks.filter((item) => !item.passed).map((item) => item.key);
      if (failed.length > 0) { response.status(409).json({ error: 'ARTICLE_SEO_GATE_FAILED', failed }); return; }
    }
    await contentRef.update({ status: 'approved', approvedAt: now, approvedBy: uid, updatedAt: now }); await audit(uid, 'content.approve', request.params.contentId); response.json({ status: 'approved', approvedAt: now });
  }
  catch (error) { next(error); }
});

contentRouter.post('/:contentId/ready', async (request, response, next) => {
  try { const uid = response.locals.identity.uid; const now = new Date().toISOString(); await db().collection('contents').doc(request.params.contentId).update({ status: 'ready_to_publish', updatedAt: now }); await audit(uid, 'content.ready_to_publish', request.params.contentId); response.json({ status: 'ready_to_publish' }); }
  catch (error) { next(error); }
});

contentRouter.post('/:contentId/status', async (request, response, next) => {
  try { const { status } = z.object({ status: z.enum(['draft','in_production','post_production','awaiting_copy','review','approved','ready_to_publish','completed','test','archived']) }).parse(request.body); const uid = response.locals.identity.uid; const now = new Date().toISOString(); await db().collection('contents').doc(request.params.contentId).update({ status, updatedAt: now }); await audit(uid, 'content.status', request.params.contentId, { status }); response.json({ status }); }
  catch (error) { next(error); }
});

contentRouter.post('/:contentId/complete', async (request, response, next) => {
  try {
    const uid = response.locals.identity.uid; const now = new Date().toISOString();
    const ref = db().collection('contents').doc(request.params.contentId); const snapshot = await ref.get();
    if (!snapshot.exists) { response.status(404).json({ error: 'CONTENT_NOT_FOUND' }); return; }
    await ref.update({ status: 'completed', completedAt: now, completedBy: uid, updatedAt: now });
    await audit(uid, 'content.complete', request.params.contentId);
    response.json({ status: 'completed', completedAt: now });
  } catch (error) { next(error); }
});

contentRouter.post('/:contentId/archive', async (request, response, next) => {
  try {
    const uid = response.locals.identity.uid; const now = new Date().toISOString();
    const ref = db().collection('contents').doc(request.params.contentId); const snapshot = await ref.get();
    if (!snapshot.exists) { response.status(404).json({ error: 'CONTENT_NOT_FOUND' }); return; }
    const currentStatus = String(snapshot.data()?.status ?? 'draft');
    if (currentStatus !== 'archived') await ref.update({ status: 'archived', archivedFromStatus: currentStatus, archivedAt: now, archivedBy: uid, updatedAt: now });
    await audit(uid, 'content.archive', request.params.contentId, { fromStatus: currentStatus });
    response.json({ status: 'archived', archivedAt: now });
  } catch (error) { next(error); }
});

contentRouter.post('/:contentId/audit', async (request, response, next) => {
  try { const input = z.object({ action: z.enum(['upload_raw','upload_final','select_asset']), detail: z.record(z.string(), z.unknown()).default({}) }).parse(request.body); await audit(response.locals.identity.uid, `content.${input.action}`, request.params.contentId, input.detail); response.status(201).json({ ok: true }); }
  catch (error) { next(error); }
});

export const manualPublishInputSchema = z.object({
  platform: z.enum(['youtube','facebook','tiktok','linkedin','zalo','website']),
  postUrl: z.string().url().max(2_000).optional(),
  platformPostId: z.string().max(500).optional(),
  note: z.string().max(2_000).optional(),
});

export function markPlatformPublished(current: PlatformPublication[], input: z.infer<typeof manualPublishInputSchema>, now: string): PlatformPublication[] {
  const published: PlatformPublication = {
    platform: input.platform,
    mode: 'manual',
    status: 'published',
    ...(input.postUrl ? { postUrl: input.postUrl } : {}),
    ...(input.platformPostId ? { platformPostId: input.platformPostId } : {}),
    ...(input.note ? { note: input.note } : {}),
    publishedAt: now,
  };
  return current.some((item) => item.platform === input.platform)
    ? current.map((item) => item.platform === input.platform ? { ...item, ...published } : item)
    : [...current, published];
}

contentRouter.post('/:contentId/manual-publish', async (request, response, next) => {
  try {
    const input = manualPublishInputSchema.parse(request.body);
    const ref = db().collection('contents').doc(request.params.contentId); const snapshot = await ref.get(); if (!snapshot.exists) { response.status(404).json({ error: 'CONTENT_NOT_FOUND' }); return; }
    const current = (snapshot.data()?.platforms ?? []) as PlatformPublication[]; const now = new Date().toISOString();
    const platforms = markPlatformPublished(current, input, now);
    const status = aggregatePublishingStatus(platforms); await ref.update({ platforms, status, updatedAt: now }); await audit(response.locals.identity.uid, 'content.manual_publish', request.params.contentId, { platform: input.platform, postUrl: input.postUrl ?? null }); response.json({ platforms, status });
  } catch (error) { next(error); }
});

contentRouter.get('/:contentId/scene-list.tsv', async (request, response, next) => {
  try { const snapshot = await db().collection('scenes').where('contentDocId', '==', request.params.contentId).get(); const rows = snapshot.docs.map((item) => item.data()).sort((a,b) => a.sceneNumber-b.sceneNumber); const tsv = ['Scene\tTiêu đề\tThời lượng\tNarration\tPrompt Google Flow', ...rows.map((item) => [item.sceneNumber,item.title,item.durationEstimate,item.narration,item.generationPrompt].map((value) => String(value ?? '').replace(/[\t\r\n]+/g,' ')).join('\t'))].join('\n'); response.type('text/tab-separated-values').send(tsv); }
  catch (error) { next(error); }
});
