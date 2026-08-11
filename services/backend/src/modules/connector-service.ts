import { Router } from 'express';
import { connectorModeVi, connectorStatusVi } from '@ancv/shared';
import { z } from 'zod';
import { listPublishingProviders } from '../connectors/registry.js';
import { requireFirebaseEditor } from '../middleware/auth.js';
import { db } from '../firebase.js';
import { testGA4, testSearchConsole, type FeasibilityResult } from '../services/google-feasibility.js';
import { testWebsite } from '../services/website-feasibility.js';
import { config } from '../config.js';

export const connectorRouter = Router();

connectorRouter.get('/health', async (_request, response, next) => {
  try {
    const connectors = await Promise.all(listPublishingProviders().map(async (provider) => {
      const capability = await provider.getCapabilities();
      return {
        platform: provider.platform,
        ...capability,
        statusLabel: connectorStatusVi[capability.authenticationStatus],
        modeLabel: connectorModeVi[capability.mode],
      };
    }));
    response.json({ checkedAt: new Date().toISOString(), connectors });
  } catch (error) { next(error); }
});

const testSchema = z.discriminatedUnion('platform', [
  z.object({ platform: z.literal('ga4') }),
  z.object({ platform: z.literal('search_console') }),
  z.object({ platform: z.literal('website'), url: z.string().url().max(2_000) }),
]);

async function persistResult(result: FeasibilityResult, testedBy: string) {
  const now = new Date().toISOString();
  const connectorRef = db().collection('connectors').doc(result.platform);
  await db().runTransaction(async (transaction) => {
    const current = await transaction.get(connectorRef);
    const existing = current.data();
    transaction.set(connectorRef, {
      id: result.platform, createdAt: existing?.createdAt ?? now, createdBy: existing?.createdBy ?? testedBy,
      updatedAt: now, testedAt: now, testedBy, ...result,
      mode: existing?.adminOverride ? existing.mode : result.recommendedMode,
      adminOverride: existing?.adminOverride ?? false,
      lastError: result.status === 'error' ? result.limitations[0] : null,
    }, { merge: true });
    const testRef = db().collection('connectorTests').doc();
    transaction.set(testRef, { id: testRef.id, createdAt: now, updatedAt: now, createdBy: testedBy, testedAt: now, testedBy, ...result });
  });
}

connectorRouter.post('/test', requireFirebaseEditor, async (request, response, next) => {
  try {
    const input = testSchema.parse(request.body);
    const testedBy = response.locals.identity?.uid ?? 'firebase-editor';
    await db().collection('connectors').doc(input.platform).set({ status: 'testing', updatedAt: new Date().toISOString(), testedBy }, { merge: true });
    let result: FeasibilityResult;
    if (input.platform === 'ga4') result = await testGA4();
    else if (input.platform === 'search_console') result = await testSearchConsole();
    else result = await testWebsite(input.url, config.wordpressUsername && config.wordpressApplicationPassword ? {
      username: config.wordpressUsername,
      applicationPassword: config.wordpressApplicationPassword,
    } : undefined);
    await persistResult(result, testedBy);
    response.json(result);
  } catch (error) { next(error); }
});
