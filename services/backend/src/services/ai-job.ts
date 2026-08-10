import { createHash } from 'node:crypto';
import type { AIOperation, AIUsageTokens } from '@ancv/shared';
import { db } from '../firebase.js';

export class AIJobInProgressError extends Error { constructor() { super('AI_JOB_IN_PROGRESS'); this.name = 'AIJobInProgressError'; } }
export class AIJobPreviouslyFailedError extends Error { constructor() { super('AI_JOB_PREVIOUSLY_FAILED_USE_NEW_REQUEST_ID'); this.name = 'AIJobPreviouslyFailedError'; } }

export interface AIExecution<T> { data: T; model: string; requestId: string | null; usage: AIUsageTokens; imageCount?: number }

export function buildAIJobId(uid: string, operation: AIOperation, idempotencyKey: string) {
  return createHash('sha256').update(`${uid}:${operation}:${idempotencyKey}`).digest('hex').slice(0, 40);
}

export async function getCompletedAIJob<T>(uid: string, operation: AIOperation, idempotencyKey: string): Promise<{ jobId: string; result: T } | null> {
  const jobId = buildAIJobId(uid, operation, idempotencyKey); const snapshot = await db().collection('aiJobs').doc(jobId).get();
  return snapshot.data()?.status === 'succeeded' ? { jobId, result: snapshot.data()?.result as T } : null;
}

export async function runAIJob<T>(input: {
  uid: string;
  operation: AIOperation;
  contentDocId?: string;
  idempotencyKey: string;
  execute: () => Promise<AIExecution<T>>;
}): Promise<{ jobId: string; duplicate: boolean; result: T }> {
  const jobId = buildAIJobId(input.uid, input.operation, input.idempotencyKey);
  const ref = db().collection('aiJobs').doc(jobId);
  const now = new Date().toISOString();
  const existingResult = await db().runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (snapshot.exists) {
      const record = snapshot.data();
      if (record?.status === 'succeeded') return record.result as T;
      if (record?.status === 'failed') throw new AIJobPreviouslyFailedError();
      throw new AIJobInProgressError();
    }
    transaction.create(ref, {
      id: jobId, status: 'queued', operation: input.operation, contentDocId: input.contentDocId ?? null,
      idempotencyKey: input.idempotencyKey, createdAt: now, updatedAt: now, createdBy: input.uid,
      attemptCount: 0, maxAttempts: 1,
    });
    return null;
  });
  if (existingResult !== null) return { jobId, duplicate: true, result: existingResult };

  await ref.update({ status: 'processing', attemptCount: 1, startedAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  try {
    const execution = await input.execute();
    const completedAt = new Date().toISOString();
    const usageRef = db().collection('aiUsage').doc();
    const auditRef = db().collection('auditLogs').doc();
    const batch = db().batch();
    batch.set(usageRef, {
      id: usageRef.id, status: 'recorded', operation: input.operation, model: execution.model,
      contentDocId: input.contentDocId ?? null, jobId, requestId: execution.requestId,
      ...execution.usage, imageCount: execution.imageCount ?? 0,
      createdAt: completedAt, updatedAt: completedAt, createdBy: input.uid,
    });
    batch.set(auditRef, {
      id: auditRef.id, status: 'recorded', action: `ai.${input.operation}`, entityType: 'content',
      entityId: input.contentDocId ?? null, jobId, createdAt: completedAt, updatedAt: completedAt, createdBy: input.uid,
    });
    batch.update(ref, { status: 'succeeded', result: execution.data, model: execution.model, requestId: execution.requestId, usage: execution.usage, completedAt, updatedAt: completedAt, lastError: null });
    await batch.commit();
    return { jobId, duplicate: false, result: execution.data };
  } catch (error) {
    const failedAt = new Date().toISOString();
    const candidate = error as { name?: string; status?: number; code?: string; requestID?: string };
    await ref.update({
      status: 'failed', failedAt, updatedAt: failedAt,
      lastError: { type: candidate.name ?? 'Error', status: candidate.status ?? null, code: candidate.code ?? null, requestId: candidate.requestID ?? null },
    });
    throw error;
  }
}
