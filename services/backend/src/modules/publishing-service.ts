import { Router } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { PLATFORMS } from '@ancv/shared';
import { z } from 'zod';
import { db } from '../firebase.js';
import { getPublishingProvider } from '../connectors/registry.js';
import { decideRetry } from '../services/retry-policy.js';
import { requireAutomationIdentity, requireFirebaseEditor } from '../middleware/auth.js';

export const publishingRouter = Router();

const manualSchema = z.object({
  postUrl: z.string().url(),
  platformPostId: z.string().max(200).optional(),
  publishedAt: z.iso.datetime(),
  note: z.string().max(2000).optional(),
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
