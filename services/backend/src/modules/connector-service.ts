import { Router } from 'express';
import { connectorModeVi, connectorStatusVi } from '@ancv/shared';
import { listPublishingProviders } from '../connectors/registry.js';

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

