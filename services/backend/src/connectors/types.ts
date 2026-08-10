import type { Capability, ConnectorMode, ConnectorStatus, Platform } from '@ancv/shared';

export interface ProviderCapabilities {
  authenticationStatus: ConnectorStatus;
  publishing: Capability;
  analytics: Capability;
  limitations: string[];
  mode: ConnectorMode;
}

export interface PublishInput {
  idempotencyKey: string;
  contentId: string;
  title: string;
  body: string;
  mediaUrls: string[];
  scheduledAt?: string;
}

export interface PublishResult {
  success: boolean;
  retryable: boolean;
  platformPostId?: string;
  postUrl?: string;
  errorCode?: string;
  message: string;
}

export interface PublishingProvider {
  readonly platform: Platform;
  getCapabilities(): Promise<ProviderCapabilities>;
  testAuthentication(): Promise<ProviderCapabilities>;
  publish(input: PublishInput): Promise<PublishResult>;
}

export interface AnalyticsQuery {
  from: string;
  to: string;
  contentIds?: string[];
}

export interface AnalyticsResult {
  available: boolean;
  collectedAt: string;
  rows: Array<Record<string, string | number>>;
  limitation?: string;
}

export interface AnalyticsProvider {
  readonly platform: Platform;
  getCapabilities(): Promise<ProviderCapabilities>;
  collect(query: AnalyticsQuery): Promise<AnalyticsResult>;
}

