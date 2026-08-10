import cors from 'cors';
import express, { type ErrorRequestHandler } from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { ZodError } from 'zod';
import { checkFirestore } from './firebase.js';
import { config } from './config.js';
import { contentRouter } from './modules/content-service.js';
import { connectorRouter } from './modules/connector-service.js';
import { publishingRouter } from './modules/publishing-service.js';
import { schedulerRouter } from './modules/scheduler-service.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: '2mb' }));
  app.use(pinoHttp({ redact: ['req.headers.authorization', 'req.headers.cookie'] }));

  app.get('/health', async (_request, response) => {
    const firestore = await checkFirestore();
    response.status(firestore === 'error' ? 503 : 200).json({
      status: firestore === 'error' ? 'degraded' : 'ok',
      service: 'ancv-marketing-backend',
      version: process.env.K_REVISION ?? 'local',
      environment: config.environment,
      checkedAt: new Date().toISOString(),
      dependencies: { firestore },
    });
  });

  app.use('/v1/content', contentRouter);
  app.use('/connectors', connectorRouter);
  app.use('/v1/publishing', publishingRouter);
  app.use('/v1/scheduler', schedulerRouter);

  const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
    const validation = error instanceof ZodError;
    response.status(validation ? 400 : 500).json({
      error: validation ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR',
      message: validation ? error.issues.map((issue) => issue.message).join('; ') : 'Đã ghi nhận lỗi hệ thống.',
    });
  };
  app.use(errorHandler);
  return app;
}
