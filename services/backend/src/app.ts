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
import { flowRouter } from './modules/flow-service.js';
import OpenAI from 'openai';
import { OpenAIConfigurationError, openAIProvider } from './services/openai-provider.js';
import { db } from './firebase.js';
import { AIJobInProgressError, AIJobPreviouslyFailedError } from './services/ai-job.js';
import { randomUUID } from 'node:crypto';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: '2mb' }));
  app.use(pinoHttp({
    redact: ['req.headers.authorization', 'req.headers.cookie'],
    genReqId(request, response) {
      const supplied = String(request.headers['x-request-id'] ?? '');
      const requestId = /^[A-Za-z0-9_-]{8,80}$/.test(supplied) ? supplied : randomUUID();
      response.setHeader('x-request-id', requestId);
      return requestId;
    },
  }));

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
  app.use('/v1/flow', flowRouter);

  const errorHandler: ErrorRequestHandler = (error, request, response, _next) => {
    const validation = error instanceof ZodError;
    const configuration = error instanceof OpenAIConfigurationError;
    const upstream = error instanceof OpenAI.APIError;
    const jobConflict = error instanceof AIJobInProgressError || error instanceof AIJobPreviouslyFailedError;
    const flowError = error instanceof Error && /^(FLOW_|LOCAL_|CHROME_|BROWSER_)/.test(error.message);
    const flowMessage = error instanceof Error ? ({
      LOCAL_AGENT_OFFLINE: 'Máy xử lý đang offline.',
      FLOW_ACCOUNT_NOT_READY: 'Tài khoản Flow cần đăng nhập lại.',
      FLOW_ACCOUNT_NOT_FOUND: 'Chưa cấu hình tài khoản Flow.',
      FLOW_PROJECT_URL_REQUIRED: 'Tài khoản Flow chưa có Project hợp lệ.',
      FLOW_JOB_ALREADY_ACTIVE: 'Scene đang được tạo video.',
    } as Record<string, string>)[error.message] : undefined;
    const explicitStatus = Number((error as { statusCode?: number }).statusCode ?? 0);
    const status = validation ? 400 : jobConflict ? 409 : configuration ? 503 : upstream && error.status === 429 ? 503 : upstream ? 502 : explicitStatus || 500;
    request.log.error({ event: 'request_failed', errorType: error instanceof Error ? error.name : 'Unknown', upstreamStatus: upstream ? error.status : undefined, upstreamRequestId: upstream ? error.requestID : undefined });
    response.status(status).json({
      error: validation ? 'VALIDATION_ERROR' : jobConflict ? error.message : flowError ? error.message : configuration ? 'CONFIGURATION_REQUIRED' : upstream ? 'OPENAI_UPSTREAM_ERROR' : explicitStatus === 404 ? 'NOT_FOUND' : 'INTERNAL_ERROR',
      message: validation ? error.issues.map((issue) => issue.message).join('; ') : jobConflict ? 'Tác vụ trùng đang chạy hoặc đã thất bại; hãy dùng request ID mới để thử lại.' : flowError ? (flowMessage ?? 'Flow Worker chưa sẵn sàng cho scene này. Kiểm tra account, project và job hiện tại.') : configuration ? 'OpenAI chưa được cấu hình.' : upstream ? 'OpenAI tạm thời không khả dụng; lỗi đã được ghi log.' : 'Đã ghi nhận lỗi hệ thống.',
    });
  };
  app.use(errorHandler);
  return app;
}
