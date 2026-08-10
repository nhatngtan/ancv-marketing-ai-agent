import cors from 'cors';
import express, { type ErrorRequestHandler } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { ZodError } from 'zod';
import { checkFirestore } from './firebase.js';
import { config } from './config.js';
import { contentRouter } from './modules/content-service.js';
import { connectorRouter } from './modules/connector-service.js';
import { publishingRouter } from './modules/publishing-service.js';
import { schedulerRouter } from './modules/scheduler-service.js';
import { aiRouter } from './modules/ai-service.js';
import OpenAI from 'openai';
import { OpenAIConfigurationError, openAIProvider } from './services/openai-provider.js';
import { db } from './firebase.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: '2mb' }));
  app.use(pinoHttp({ redact: ['req.headers.authorization', 'req.headers.cookie'] }));

  app.get('/health', async (_request, response) => {
    const firestore = await checkFirestore();
    let openai: string = openAIProvider.getHealth().status;
    if (openai === 'operational' && firestore === 'operational') {
      const snapshot = await db().collection('systemSettings').doc('openai').get();
      openai = snapshot.data()?.status === 'available' ? 'operational' : snapshot.data()?.status === 'error' ? 'error' : 'configured_untested';
    }
    response.status(firestore === 'error' ? 503 : 200).json({
      status: firestore === 'error' ? 'degraded' : 'ok',
      service: 'ancv-marketing-backend',
      version: process.env.K_REVISION ?? 'local',
      environment: config.environment,
      checkedAt: new Date().toISOString(),
      dependencies: {
        firestore,
        openai,
        ga4: config.ga4PropertyId ? 'configuration_present' : 'configuration_required',
        searchConsole: config.searchConsoleSiteUrl ? 'configuration_present' : 'configuration_required',
      },
    });
  });

  app.use('/v1/content', contentRouter);
  app.use('/connectors', connectorRouter);
  app.use('/v1/publishing', publishingRouter);
  app.use('/v1/scheduler', schedulerRouter);
  app.use('/v1/ai', aiRouter);

  const errorHandler: ErrorRequestHandler = (error, request, response, _next) => {
    const validation = error instanceof ZodError;
    const configuration = error instanceof OpenAIConfigurationError;
    const upstream = error instanceof OpenAI.APIError;
    const status = validation ? 400 : configuration ? 503 : upstream && error.status === 429 ? 503 : upstream ? 502 : 500;
    request.log.error({ event: 'request_failed', errorType: error instanceof Error ? error.name : 'Unknown', upstreamStatus: upstream ? error.status : undefined, requestId: upstream ? error.requestID : undefined });
    response.status(status).json({
      error: validation ? 'VALIDATION_ERROR' : configuration ? 'CONFIGURATION_REQUIRED' : upstream ? 'OPENAI_UPSTREAM_ERROR' : 'INTERNAL_ERROR',
      message: validation ? error.issues.map((issue) => issue.message).join('; ') : configuration ? 'OpenAI chưa được cấu hình.' : upstream ? 'OpenAI tạm thời không khả dụng; lỗi đã được ghi log.' : 'Đã ghi nhận lỗi hệ thống.',
    });
  };
  app.use(errorHandler);
  return app;
}
