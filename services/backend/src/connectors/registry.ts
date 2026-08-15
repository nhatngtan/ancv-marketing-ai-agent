import { PLATFORMS, type Platform } from '@ancv/shared';
import { ManualPublishingProvider } from './manual-provider.js';
import type { PublishingProvider } from './types.js';
import { YouTubePublishingProvider } from './youtube-provider.js';

const providers = new Map<Platform, PublishingProvider>(
  PLATFORMS.map((platform) => [platform, new ManualPublishingProvider(platform)]),
);
providers.set('youtube', new YouTubePublishingProvider());

export function getPublishingProvider(platform: Platform): PublishingProvider {
  const provider = providers.get(platform);
  if (!provider) throw new Error(`Provider not registered: ${platform}`);
  return provider;
}

export function registerPublishingProvider(provider: PublishingProvider): void {
  providers.set(provider.platform, provider);
}

export function listPublishingProviders(): PublishingProvider[] {
  return [...providers.values()];
}
