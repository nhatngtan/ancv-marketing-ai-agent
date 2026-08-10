import { Router } from 'express';
import { z } from 'zod';
import { requireFirebaseEditor } from '../middleware/auth.js';
import { openAIProvider } from '../services/openai-provider.js';

export const aiRouter = Router();
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

aiRouter.get('/health', (_request, response) => response.json(openAIProvider.getHealth()));
