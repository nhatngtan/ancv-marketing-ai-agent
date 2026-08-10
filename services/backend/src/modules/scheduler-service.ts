import { Router } from 'express';
import { db } from '../firebase.js';
import { requireAutomationIdentity } from '../middleware/auth.js';

export const schedulerRouter = Router();

schedulerRouter.post('/analytics/daily', requireAutomationIdentity, async (_request, response, next) => {
  try {
    const snapshot = await db().collection('connectors').where('status', 'in', ['available', 'partially_available']).get();
    const eligible = snapshot.docs
      .map((item) => item.data())
      .filter((item) => ['available', 'partially_available'].includes(item.authenticationStatus));
    response.json({ ok: true, eligibleConnectors: eligible.map((item) => item.platform), skippedUnverified: true, queued: 0 });
  } catch (error) { next(error); }
});

schedulerRouter.post('/reports/:period', requireAutomationIdentity, async (request, response) => {
  response.status(202).json({ ok: true, period: request.params.period, status: 'foundation_ready', note: 'Report generation uses only available stored data.' });
});
