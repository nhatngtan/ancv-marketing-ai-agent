import { Router } from 'express';
import { z } from 'zod';
import { allocateContentId } from '../services/content-id.js';
import { requireFirebaseEditor } from '../middleware/auth.js';

export const contentRouter = Router();

contentRouter.post('/allocate-id', requireFirebaseEditor, async (request, response, next) => {
  try {
    const payload = z.object({ type: z.enum(['video', 'article']) }).parse(request.body);
    response.status(201).json({ contentId: await allocateContentId(payload.type) });
  } catch (error) { next(error); }
});
