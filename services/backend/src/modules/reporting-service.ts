import { Router } from 'express';
import { z } from 'zod';
import { requireFirebaseUser } from '../middleware/auth.js';
import { getMarketingDashboard } from '../services/marketing-reporting.js';

export const reportingRouter = Router();

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const querySchema = z.object({ from: dateString, to: dateString }).superRefine((value, context) => {
  const from = new Date(`${value.from}T00:00:00.000Z`);
  const to = new Date(`${value.to}T00:00:00.000Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || value.from > value.to) {
    context.addIssue({ code: 'custom', message: 'Khoảng thời gian không hợp lệ.' });
    return;
  }
  if (to.getTime() - from.getTime() > 366 * 86_400_000) {
    context.addIssue({ code: 'custom', message: 'Khoảng báo cáo tối đa 366 ngày.' });
  }
});

reportingRouter.get('/marketing-dashboard', requireFirebaseUser, async (request, response, next) => {
  try {
    const { from, to } = querySchema.parse(request.query);
    response.json(await getMarketingDashboard(from, to));
  } catch (error) { next(error); }
});
