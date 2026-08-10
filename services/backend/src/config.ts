export const config = {
  port: Number(process.env.PORT ?? 8080),
  projectId: process.env.GOOGLE_CLOUD_PROJECT ?? process.env.GCLOUD_PROJECT ?? 'local-ancv',
  taskAudience: process.env.TASK_AUDIENCE ?? '',
  environment: process.env.NODE_ENV ?? 'development',
  openAITextModel: process.env.OPENAI_TEXT_MODEL ?? 'gpt-5.6-terra',
  openAIImageModel: process.env.OPENAI_IMAGE_MODEL ?? 'gpt-image-2',
  ga4PropertyId: process.env.GA4_PROPERTY_ID ?? '',
  searchConsoleSiteUrl: process.env.SEARCH_CONSOLE_SITE_URL ?? '',
};
