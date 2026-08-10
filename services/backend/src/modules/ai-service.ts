import { Router } from 'express';
import { z } from 'zod';
import { db } from '../firebase.js';
import { requireAutomationIdentity, requireFirebaseEditor } from '../middleware/auth.js';
import { openAIProvider } from '../services/openai-provider.js';

export const aiRouter = Router();

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
  try {
    includeImage = z.object({ includeImage: z.boolean().default(false) }).parse(request.body).includeImage;
  } catch (error) { next(error); return; }
  try {
    const evidence = await openAIProvider.smokeTest(includeImage);
    const settingRef = db().collection('systemSettings').doc('openai');
    const existing = (await settingRef.get()).data();
    const imageAlreadyPassed = !includeImage && existing?.imageApi === 'available' && existing?.evidence?.image?.status === 'passed';
    if (imageAlreadyPassed) evidence.image = existing.evidence.image;
    const record = {
      id: 'openai', status: includeImage || imageAlreadyPassed ? 'available' : 'partially_available',
      responsesApi: 'available', imageApi: includeImage || imageAlreadyPassed ? 'available' : 'not_tested',
      testedAt: evidence.checkedAt, testedBy, updatedAt: evidence.checkedAt,
      models: { text: evidence.text.model, image: evidence.image.model }, evidence, lastError: null,
    };
    await settingRef.set(record, { merge: true });
    request.log.info({ event: 'openai_usage', testedBy, status: record.status, evidence });
    response.json(record);
  } catch (error) {
    const now = new Date().toISOString();
    const upstream = error as { status?: number; requestID?: string; code?: string; name?: string };
    await db().collection('systemSettings').doc('openai').set({
      id: 'openai', status: 'error', testedAt: now, testedBy, updatedAt: now,
      lastError: { type: upstream.name ?? 'Error', status: upstream.status ?? null, code: upstream.code ?? null, requestId: upstream.requestID ?? null },
    }, { merge: true });
    request.log.error({ event: 'openai_smoke_failed', testedBy, errorType: upstream.name, status: upstream.status, code: upstream.code, requestId: upstream.requestID });
    next(error);
  }
});

aiRouter.use(requireFirebaseEditor);

aiRouter.post('/split-scenes', async (request, response, next) => {
  try {
    const { masterScript } = z.object({ masterScript: z.string().min(50).max(100_000) }).parse(request.body);
    response.json({ scenes: await openAIProvider.splitScenes(masterScript) });
  } catch (error) { next(error); }
});

aiRouter.post('/platform-copy', async (request, response, next) => {
  try {
    const input = z.object({ source: z.string().min(1).max(100_000), platform: z.string().min(1).max(40) }).parse(request.body);
    response.json({ text: await openAIProvider.generatePlatformCopy(input) });
  } catch (error) { next(error); }
});

aiRouter.post('/articles', async (request, response, next) => {
  try {
    const input = z.object({ topic: z.string().min(1).max(500), brief: z.string().max(50_000).optional() }).parse(request.body);
    response.json({ text: await openAIProvider.writeArticle(input) });
  } catch (error) { next(error); }
});
