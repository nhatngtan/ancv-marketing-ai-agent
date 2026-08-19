import { Router } from 'express';
import { z } from 'zod';
import { BROWSER_PLATFORMS, type BrowserPlatform, type BrowserProfileMapping, type BrowserProfileSettings, type ChromeProfileMetadata, type ContentRecord, type FlowAccountRecord, type FlowJobRecord, type MediaAssetRecord, type SceneRecord } from '@ancv/shared';
import { requireFirebaseAdmin, requireFirebaseEditor } from '../middleware/auth.js';
import { db } from '../firebase.js';
import type { Firestore } from 'firebase-admin/firestore';

export const flowRouter = Router();

const createJobSchema = z.object({
  contentDocId: z.string().min(1).max(200),
  sceneId: z.string().min(1).max(200),
  flowAccountId: z.string().regex(/^[a-z0-9][a-z0-9-]{1,48}$/),
  generationPrompt: z.string().trim().min(1).max(8_000),
  durationEstimate: z.union([z.literal(4), z.literal(6), z.literal(8), z.literal(10)]),
  aspectRatio: z.enum(['9:16', '16:9']),
});
const openFolderSchema = z.object({
  contentDocId: z.string().min(1).max(200),
  sceneId: z.string().min(1).max(200),
  agentId: z.string().regex(/^[a-z0-9][a-z0-9-]{1,48}$/).default('ancv-windows-01'),
});
const openVideoFolderSchema = z.object({
  contentDocId: z.string().min(1).max(200),
  agentId: z.string().regex(/^[a-z0-9][a-z0-9-]{1,48}$/).default('ancv-windows-01'),
});
const registerVideoFinalSchema = openVideoFolderSchema.extend({
  relativePath: z.string().min(1).max(1_000),
});
const openMediaSchema = z.object({
  contentDocId: z.string().min(1).max(200),
  assetId: z.string().min(1).max(200),
  agentId: z.string().regex(/^[a-z0-9][a-z0-9-]{1,48}$/).default('ancv-windows-01'),
});
const chromeProfileIdSchema = z.string().regex(/^(?:Default|Profile(?: \d+)?)$/);
const browserMappingSchema = z.object({
  google_flow: chromeProfileIdSchema.optional(), facebook: chromeProfileIdSchema.optional(),
  tiktok: chromeProfileIdSchema.optional(), linkedin: chromeProfileIdSchema.optional(), zalo: chromeProfileIdSchema.optional(),
});
const browserTestSchema = z.object({ platform: z.enum(BROWSER_PLATFORMS), agentId: z.string().regex(/^[a-z0-9][a-z0-9-]{1,48}$/).default('ancv-windows-01') });

async function localAgentOnline(agentId: string): Promise<boolean> {
  const snapshot = await db().collection('localAgents').doc(agentId).get();
  const data = snapshot.data();
  return data?.status === 'online' && Date.now() - Date.parse(String(data.lastSeen ?? '')) < 45_000;
}

async function queueLocalCommand(input: { agentId: string; command: 'scan_profiles' | 'validate_profile'; platform?: BrowserPlatform; chromeProfileId?: string; uid: string }) {
  if (!await localAgentOnline(input.agentId)) throw Object.assign(new Error('LOCAL_AGENT_OFFLINE'), { statusCode: 409 });
  const now = new Date().toISOString();
  const ref = db().collection('localCommands').doc();
  const command = { id: ref.id, agentId: input.agentId, command: input.command, status: 'queued' as const, error: null, createdAt: now, updatedAt: now, createdBy: input.uid, ...(input.platform ? { platform: input.platform } : {}), ...(input.chromeProfileId ? { chromeProfileId: input.chromeProfileId } : {}) };
  await ref.set(command);
  return command;
}

export function isOfficialFlowProjectUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && url.hostname === 'labs.google'
      && /^\/fx\/(?:[a-z]{2}(?:-[A-Z]{2})?\/)?tools\/flow\/project\/[^/]+\/?$/.test(url.pathname);
  } catch {
    return false;
  }
}

export async function createFlowJobWithCurrentState(input: z.infer<typeof createJobSchema>, uid: string, store: Firestore = db()): Promise<FlowJobRecord> {
  const contentRef = store.collection('contents').doc(input.contentDocId);
  const sceneRef = store.collection('scenes').doc(input.sceneId);
  const accountRef = store.collection('flowAccounts').doc(input.flowAccountId);
  const jobRef = store.collection('flowJobs').doc(input.sceneId);
  const now = new Date().toISOString();
  return store.runTransaction(async (transaction) => {
    const [contentSnapshot, sceneSnapshot, accountSnapshot, jobSnapshot] = await Promise.all([
      transaction.get(contentRef), transaction.get(sceneRef), transaction.get(accountRef), transaction.get(jobRef),
    ]);
    if (!contentSnapshot.exists || contentSnapshot.data()?.type !== 'video') throw Object.assign(new Error('VIDEO_CONTENT_NOT_FOUND'), { statusCode: 404 });
    if (!sceneSnapshot.exists || sceneSnapshot.data()?.contentDocId !== input.contentDocId) throw Object.assign(new Error('SCENE_NOT_FOUND'), { statusCode: 404 });
    if (!accountSnapshot.exists) throw Object.assign(new Error('FLOW_ACCOUNT_NOT_FOUND'), { statusCode: 409 });
    const account = accountSnapshot.data() as FlowAccountRecord;
    if (account.status !== 'ready') throw Object.assign(new Error('FLOW_ACCOUNT_NOT_READY'), { statusCode: 409 });
    if (account.profileKind !== 'managed') throw Object.assign(new Error('FLOW_MANAGED_PROFILE_REQUIRED'), { statusCode: 409 });
    const managedProfileId = account.managedProfileId?.trim() ?? '';
    if (!/^[a-z0-9][a-z0-9-]{1,48}$/.test(managedProfileId)) throw Object.assign(new Error('FLOW_MANAGED_PROFILE_NOT_CONFIGURED'), { statusCode: 409 });
    const expectedAccount = (account.expectedAccount ?? account.email)?.trim().toLowerCase() ?? '';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(expectedAccount)) throw Object.assign(new Error('FLOW_EXPECTED_ACCOUNT_REQUIRED'), { statusCode: 409 });
    if (account.verifiedAccount?.trim().toLowerCase() !== expectedAccount || !account.verifiedAt) {
      throw Object.assign(new Error('FLOW_ACCOUNT_NOT_VERIFIED'), { statusCode: 409 });
    }
    const content = contentSnapshot.data() as ContentRecord;
    const projectUrl = account.projectUrl ?? content.flowProjectUrl ?? '';
    if (!isOfficialFlowProjectUrl(projectUrl)) throw Object.assign(new Error('FLOW_PROJECT_URL_REQUIRED'), { statusCode: 409 });
    const existing = jobSnapshot.data() as FlowJobRecord | undefined;
    if (existing && ['queued', 'processing'].includes(existing.status)) throw Object.assign(new Error('FLOW_JOB_ALREADY_ACTIVE'), { statusCode: 409 });
    const scene = sceneSnapshot.data() as SceneRecord;
    const record: FlowJobRecord = {
      id: jobRef.id, contentDocId: input.contentDocId, contentId: content.contentId,
      sceneId: input.sceneId, sceneNumber: scene.sceneNumber, prompt: input.generationPrompt,
      durationEstimate: input.durationEstimate, aspectRatio: input.aspectRatio,
      flowAccountId: input.flowAccountId, flowProjectUrl: projectUrl,
      profileKind: 'managed', managedProfileId, expectedAccount,
      flowAccountEmail: expectedAccount,
      executionMode: 'playwright_fallback', storageStrategy: 'local_first',
      status: 'queued', stage: 'queued', attempt: Number(existing?.attempt ?? 0) + 1, error: null,
      createdAt: existing?.createdAt ?? now, updatedAt: now, createdBy: uid,
    };
    transaction.set(jobRef, record);
    transaction.update(sceneRef, {
      generationPrompt: input.generationPrompt, durationEstimate: input.durationEstimate,
      flowJobId: jobRef.id, flowStatus: 'queued', updatedAt: now,
    });
    transaction.update(contentRef, {
      visualStyle: { ...(content.visualStyle ?? {}), aspectRatio: input.aspectRatio }, updatedAt: now,
    });
    return record;
  });
}

flowRouter.get('/browser-profiles', requireFirebaseAdmin, async (_request, response, next) => {
  try {
    const [settings, agent] = await Promise.all([db().collection('systemSettings').doc('browserProfiles').get(), db().collection('localAgents').doc('ancv-windows-01').get()]);
    const lastSeen = String(agent.data()?.lastSeen ?? '');
    response.json({
      settings: settings.exists ? settings.data() : null,
      agent: { id: 'ancv-windows-01', status: agent.data()?.status ?? 'offline', lastSeen: lastSeen || null, online: agent.data()?.status === 'online' && Date.now() - Date.parse(lastSeen) < 45_000 },
    });
  } catch (error) { next(error); }
});

flowRouter.post('/browser-profiles/scan', requireFirebaseAdmin, async (_request, response, next) => {
  try { response.status(201).json({ command: await queueLocalCommand({ agentId: 'ancv-windows-01', command: 'scan_profiles', uid: response.locals.identity.uid }) }); }
  catch (error) { next(error); }
});

flowRouter.put('/browser-profiles/mappings', requireFirebaseAdmin, async (request, response, next) => {
  try {
    const selections = browserMappingSchema.parse(request.body);
    const ref = db().collection('systemSettings').doc('browserProfiles');
    const snapshot = await ref.get();
    if (!snapshot.exists) throw Object.assign(new Error('CHROME_PROFILES_NOT_SCANNED'), { statusCode: 409 });
    const settings = snapshot.data() as BrowserProfileSettings;
    const profiles = (settings.profiles ?? []) as ChromeProfileMetadata[];
    const now = new Date().toISOString(); const uid = response.locals.identity.uid as string;
    const mappings: Partial<Record<BrowserPlatform, BrowserProfileMapping>> = {};
    const validations = { ...(settings.validations ?? {}) };
    for (const platform of BROWSER_PLATFORMS) {
      const chromeProfileId = selections[platform];
      if (!chromeProfileId) continue;
      const profile = profiles.find((item) => item.chromeProfileId === chromeProfileId);
      if (!profile) throw Object.assign(new Error(`CHROME_PROFILE_NOT_FOUND:${platform}`), { statusCode: 409 });
      const previous = settings.mappings?.[platform];
      mappings[platform] = {
        platform, machineId: settings.machineId, chromeProfileId, profileLabel: profile.profileLabel,
        updatedAt: now, updatedBy: uid,
      };
      if (previous?.chromeProfileId !== chromeProfileId) delete validations[platform];
    }
    await ref.update({ mappings, validations, updatedAt: now, updatedBy: uid });
    response.json({ settings: { ...settings, mappings, validations, updatedAt: now } });
  } catch (error) { next(error); }
});

flowRouter.post('/browser-profiles/test', requireFirebaseAdmin, async (request, response, next) => {
  try {
    const input = browserTestSchema.parse(request.body);
    const settings = (await db().collection('systemSettings').doc('browserProfiles').get()).data() as BrowserProfileSettings | undefined;
    const mapping = settings?.mappings?.[input.platform];
    if (!mapping) throw Object.assign(new Error('BROWSER_PROFILE_NOT_CONFIGURED'), { statusCode: 409 });
    const command = await queueLocalCommand({ agentId: input.agentId, command: 'validate_profile', platform: input.platform, chromeProfileId: mapping.chromeProfileId, uid: response.locals.identity.uid });
    response.status(201).json({ command });
  } catch (error) { next(error); }
});

flowRouter.get('/browser-profiles/commands/:commandId', requireFirebaseAdmin, async (request, response, next) => {
  try {
    const commandId = z.string().regex(/^[A-Za-z0-9_-]{1,200}$/).parse(request.params.commandId);
    const snapshot = await db().collection('localCommands').doc(commandId).get();
    if (!snapshot.exists) { response.status(404).json({ error: 'NOT_FOUND' }); return; }
    response.json({ command: snapshot.data() });
  } catch (error) { next(error); }
});

flowRouter.post('/jobs', requireFirebaseEditor, async (request, response, next) => {
  try {
    const input = createJobSchema.parse(request.body);
    if (!await localAgentOnline('ancv-windows-01')) throw Object.assign(new Error('LOCAL_AGENT_OFFLINE'), { statusCode: 409 });
    const uid = response.locals.identity.uid as string;
    const job = await createFlowJobWithCurrentState(input, uid);
    response.status(201).json({ job });
  } catch (error) { next(error); }
});

flowRouter.post('/local-commands/open-scene-folder', requireFirebaseEditor, async (request, response, next) => {
  try {
    const input = openFolderSchema.parse(request.body);
    const uid = response.locals.identity.uid as string;
    const [contentSnapshot, sceneSnapshot] = await Promise.all([
      db().collection('contents').doc(input.contentDocId).get(),
      db().collection('scenes').doc(input.sceneId).get(),
    ]);
    if (!contentSnapshot.exists || contentSnapshot.data()?.type !== 'video') throw Object.assign(new Error('VIDEO_CONTENT_NOT_FOUND'), { statusCode: 404 });
    if (!sceneSnapshot.exists || sceneSnapshot.data()?.contentDocId !== input.contentDocId) throw Object.assign(new Error('SCENE_NOT_FOUND'), { statusCode: 404 });
    const contentId = String(contentSnapshot.data()?.contentId ?? '');
    const sceneNumber = Number(sceneSnapshot.data()?.sceneNumber ?? 0);
    if (!/^ANCV-VID-\d{4}-[A-Z0-9-]+$/.test(contentId) || !Number.isInteger(sceneNumber) || sceneNumber < 1) throw Object.assign(new Error('LOCAL_FOLDER_METADATA_INVALID'), { statusCode: 409 });
    const now = new Date().toISOString();
    const ref = db().collection('localCommands').doc();
    const command = {
      id: ref.id, agentId: input.agentId, command: 'open_folder' as const,
      relativePath: `Projects/${contentId}/Video Raw/Scene-${String(sceneNumber).padStart(2, '0')}`,
      status: 'queued' as const, error: null,
      createdAt: now, updatedAt: now, createdBy: uid,
    };
    await ref.set(command);
    response.status(201).json({ command });
  } catch (error) { next(error); }
});

flowRouter.post('/local-commands/open-video-folder', requireFirebaseEditor, async (request, response, next) => {
  try {
    const input = openVideoFolderSchema.parse(request.body);
    if (!await localAgentOnline(input.agentId)) throw Object.assign(new Error('LOCAL_AGENT_OFFLINE'), { statusCode: 409 });
    const content = await db().collection('contents').doc(input.contentDocId).get();
    if (!content.exists || content.data()?.type !== 'video') throw Object.assign(new Error('VIDEO_CONTENT_NOT_FOUND'), { statusCode: 404 });
    const contentId = String(content.data()?.contentId ?? '');
    if (!/^ANCV-VID-\d{4}-[A-Z0-9-]+$/.test(contentId)) throw Object.assign(new Error('LOCAL_FOLDER_METADATA_INVALID'), { statusCode: 409 });
    const now = new Date().toISOString(); const ref = db().collection('localCommands').doc();
    const command = { id: ref.id, agentId: input.agentId, command: 'open_folder' as const, relativePath: `Projects/${contentId}`, status: 'queued' as const, error: null, createdAt: now, updatedAt: now, createdBy: response.locals.identity.uid };
    await ref.set(command); response.status(201).json({ command });
  } catch (error) { next(error); }
});

flowRouter.post('/local-commands/open-media', requireFirebaseEditor, async (request, response, next) => {
  try {
    const input = openMediaSchema.parse(request.body);
    if (!await localAgentOnline(input.agentId)) throw Object.assign(new Error('LOCAL_AGENT_OFFLINE'), { statusCode: 409 });
    const snapshot = await db().collection('mediaAssets').doc(input.assetId).get();
    if (!snapshot.exists) throw Object.assign(new Error('MEDIA_ASSET_NOT_FOUND'), { statusCode: 404 });
    const asset = { id: snapshot.id, ...snapshot.data() } as MediaAssetRecord;
    if (asset.contentDocId !== input.contentDocId || asset.storageType !== 'local' || !asset.relativePath) throw Object.assign(new Error('LOCAL_MEDIA_REQUIRED'), { statusCode: 409 });
    const now = new Date().toISOString(); const ref = db().collection('localCommands').doc();
    const command = { id: ref.id, agentId: input.agentId, command: 'open_file' as const, relativePath: asset.relativePath, status: 'queued' as const, error: null, createdAt: now, updatedAt: now, createdBy: response.locals.identity.uid };
    await ref.set(command); response.status(201).json({ command });
  } catch (error) { next(error); }
});

flowRouter.post('/local-commands/scan-video-final', requireFirebaseEditor, async (request, response, next) => {
  try {
    const input = openVideoFolderSchema.parse(request.body);
    if (!await localAgentOnline(input.agentId)) throw Object.assign(new Error('LOCAL_AGENT_OFFLINE'), { statusCode: 409 });
    const content = await db().collection('contents').doc(input.contentDocId).get();
    if (!content.exists || content.data()?.type !== 'video') throw Object.assign(new Error('VIDEO_CONTENT_NOT_FOUND'), { statusCode: 404 });
    const contentId = String(content.data()?.contentId ?? '');
    if (!/^ANCV-VID-\d{4}-[A-Z0-9-]+$/.test(contentId)) throw Object.assign(new Error('LOCAL_FOLDER_METADATA_INVALID'), { statusCode: 409 });
    const now = new Date().toISOString(); const ref = db().collection('localCommands').doc();
    const command = {
      id: ref.id, agentId: input.agentId, command: 'scan_video_final' as const,
      contentDocId: input.contentDocId, contentId, relativePath: `Projects/${contentId}/Video Final`,
      status: 'queued' as const, error: null, createdAt: now, updatedAt: now, createdBy: response.locals.identity.uid,
    };
    await ref.set(command); response.status(201).json({ command });
  } catch (error) { next(error); }
});

flowRouter.post('/local-commands/register-video-final', requireFirebaseEditor, async (request, response, next) => {
  try {
    const input = registerVideoFinalSchema.parse(request.body);
    if (!await localAgentOnline(input.agentId)) throw Object.assign(new Error('LOCAL_AGENT_OFFLINE'), { statusCode: 409 });
    const content = await db().collection('contents').doc(input.contentDocId).get();
    if (!content.exists || content.data()?.type !== 'video') throw Object.assign(new Error('VIDEO_CONTENT_NOT_FOUND'), { statusCode: 404 });
    const contentId = String(content.data()?.contentId ?? '');
    const normalized = input.relativePath.replaceAll('\\', '/').replace(/^\/+/, '');
    const prefix = `Projects/${contentId}/Video Final/`;
    const fileName = normalized.startsWith(prefix) ? normalized.slice(prefix.length) : '';
    if (!/^ANCV-VID-\d{4}-[A-Z0-9-]+$/.test(contentId) || !fileName || fileName.includes('/') || !/\.(?:mp4|mov|m4v|webm)$/i.test(fileName)) {
      throw Object.assign(new Error('LOCAL_FINAL_PATH_INVALID'), { statusCode: 409 });
    }
    const now = new Date().toISOString(); const ref = db().collection('localCommands').doc();
    const command = {
      id: ref.id, agentId: input.agentId, command: 'register_video_final' as const,
      contentDocId: input.contentDocId, contentId, relativePath: normalized,
      status: 'queued' as const, error: null, createdAt: now, updatedAt: now, createdBy: response.locals.identity.uid,
    };
    await ref.set(command); response.status(201).json({ command });
  } catch (error) { next(error); }
});

flowRouter.get('/local-commands/:commandId', requireFirebaseEditor, async (request, response, next) => {
  try {
    const commandId = z.string().regex(/^[A-Za-z0-9_-]{1,200}$/).parse(request.params.commandId);
    const snapshot = await db().collection('localCommands').doc(commandId).get();
    if (!snapshot.exists) { response.status(404).json({ error: 'NOT_FOUND' }); return; }
    response.json({ command: snapshot.data() });
  } catch (error) { next(error); }
});
