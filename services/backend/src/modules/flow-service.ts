import { Router } from 'express';
import { z } from 'zod';
import type { ContentRecord, FlowAccountRecord, FlowJobRecord, SceneRecord } from '@ancv/shared';
import { requireFirebaseEditor } from '../middleware/auth.js';
import { db } from '../firebase.js';

export const flowRouter = Router();
flowRouter.use(requireFirebaseEditor);

const createJobSchema = z.object({
  contentDocId: z.string().min(1).max(200),
  sceneId: z.string().min(1).max(200),
  flowAccountId: z.string().regex(/^[a-z0-9][a-z0-9-]{1,48}$/),
});
const openFolderSchema = z.object({
  contentDocId: z.string().min(1).max(200),
  sceneId: z.string().min(1).max(200),
  agentId: z.string().regex(/^[a-z0-9][a-z0-9-]{1,48}$/).default('ancv-windows-01'),
});

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

flowRouter.post('/jobs', async (request, response, next) => {
  try {
    const input = createJobSchema.parse(request.body);
    const uid = response.locals.identity.uid as string;
    const contentRef = db().collection('contents').doc(input.contentDocId);
    const sceneRef = db().collection('scenes').doc(input.sceneId);
    const accountRef = db().collection('flowAccounts').doc(input.flowAccountId);
    const jobRef = db().collection('flowJobs').doc(input.sceneId);
    const now = new Date().toISOString();

    const job = await db().runTransaction(async (transaction) => {
      const [contentSnapshot, sceneSnapshot, accountSnapshot, jobSnapshot] = await Promise.all([
        transaction.get(contentRef), transaction.get(sceneRef), transaction.get(accountRef), transaction.get(jobRef),
      ]);
      if (!contentSnapshot.exists || contentSnapshot.data()?.type !== 'video') throw Object.assign(new Error('VIDEO_CONTENT_NOT_FOUND'), { statusCode: 404 });
      if (!sceneSnapshot.exists || sceneSnapshot.data()?.contentDocId !== input.contentDocId) throw Object.assign(new Error('SCENE_NOT_FOUND'), { statusCode: 404 });
      if (!accountSnapshot.exists) throw Object.assign(new Error('FLOW_ACCOUNT_NOT_FOUND'), { statusCode: 409 });
      const account = accountSnapshot.data() as FlowAccountRecord;
      if (account.status !== 'ready') throw Object.assign(new Error('FLOW_ACCOUNT_NOT_READY'), { statusCode: 409 });
      const projectUrl = account.projectUrl ?? (contentSnapshot.data() as ContentRecord).flowProjectUrl ?? '';
      if (!isOfficialFlowProjectUrl(projectUrl)) throw Object.assign(new Error('FLOW_PROJECT_URL_REQUIRED'), { statusCode: 409 });
      const existing = jobSnapshot.data() as FlowJobRecord | undefined;
      if (existing && ['queued', 'processing'].includes(existing.status)) throw Object.assign(new Error('FLOW_JOB_ALREADY_ACTIVE'), { statusCode: 409 });
      const scene = sceneSnapshot.data() as SceneRecord;
      const prompt = scene.generationPrompt?.trim();
      if (!prompt) throw Object.assign(new Error('FLOW_PROMPT_REQUIRED'), { statusCode: 409 });
      const content = contentSnapshot.data() as ContentRecord;
      const record: FlowJobRecord = {
        id: jobRef.id, contentDocId: input.contentDocId, contentId: content.contentId,
        sceneId: input.sceneId, sceneNumber: scene.sceneNumber, prompt,
        flowAccountId: input.flowAccountId, flowProjectUrl: projectUrl,
        executionMode: 'playwright_fallback', storageStrategy: 'local_first',
        status: 'queued', attempt: Number(existing?.attempt ?? 0) + 1, error: null,
        createdAt: existing?.createdAt ?? now, updatedAt: now, createdBy: uid,
      };
      transaction.set(jobRef, record);
      transaction.update(sceneRef, { flowJobId: jobRef.id, flowStatus: 'queued', updatedAt: now });
      return record;
    });
    response.status(201).json({ job });
  } catch (error) { next(error); }
});

flowRouter.post('/local-commands/open-scene-folder', async (request, response, next) => {
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
