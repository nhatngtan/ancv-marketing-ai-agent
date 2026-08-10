export const config = {
  port: Number(process.env.PORT ?? 8080),
  projectId: process.env.GOOGLE_CLOUD_PROJECT ?? process.env.GCLOUD_PROJECT ?? 'local-ancv',
  taskAudience: process.env.TASK_AUDIENCE ?? '',
  environment: process.env.NODE_ENV ?? 'development',
};

