export const config = {
  port: Number(process.env.PORT ?? 8080),
  projectId: process.env.GOOGLE_CLOUD_PROJECT ?? process.env.GCLOUD_PROJECT ?? 'local-ancv',
  taskAudience: process.env.TASK_AUDIENCE ?? '',
  environment: process.env.NODE_ENV ?? 'development',
  openAITextModel: process.env.OPENAI_TEXT_MODEL ?? 'gpt-5.6-terra',
  openAIImageModel: process.env.OPENAI_IMAGE_MODEL ?? 'gpt-image-2',
  ga4PropertyId: process.env.GA4_PROPERTY_ID ?? '',
  searchConsoleSiteUrl: process.env.SEARCH_CONSOLE_SITE_URL ?? '',
  wordpressBaseUrl: process.env.WORDPRESS_BASE_URL ?? '',
  wordpressUsername: process.env.WORDPRESS_USERNAME ?? '',
  wordpressApplicationPassword: process.env.WORDPRESS_APPLICATION_PASSWORD ?? '',
  youtubeOAuthClientId: process.env.YOUTUBE_OAUTH_CLIENT_ID ?? '',
  youtubeOAuthClientSecret: process.env.YOUTUBE_OAUTH_CLIENT_SECRET ?? '',
  youtubeRefreshToken: process.env.YOUTUBE_REFRESH_TOKEN ?? '',
  youtubeChannelId: process.env.YOUTUBE_CHANNEL_ID ?? 'UCy-H7__UvdWcTbUax3RGDcA',
  aiRateLimitPerTenMinutes: Number(process.env.AI_RATE_LIMIT_PER_10_MINUTES ?? 20),
};

export const aiModelConfig = {
  scene_breakdown: config.openAITextModel,
  scene_regeneration: config.openAITextModel,
  flow_prompt: config.openAITextModel,
  video_social_copy: config.openAITextModel,
  article_generation: config.openAITextModel,
  article_platform_copy: config.openAITextModel,
  image_generation: config.openAIImageModel,
  report_analysis: config.openAITextModel,
} as const;
