export const CONNECTOR_STATUSES = [
  'not_tested', 'testing', 'available', 'partially_available', 'manual_only',
  'pending_review', 'unavailable', 'error',
] as const;
export type ConnectorStatus = (typeof CONNECTOR_STATUSES)[number];

export const CONNECTOR_MODES = ['automatic', 'semi_automatic', 'manual'] as const;
export type ConnectorMode = (typeof CONNECTOR_MODES)[number];

export const PLATFORMS = [
  'youtube', 'facebook', 'tiktok', 'linkedin', 'zalo', 'website', 'ga4', 'search_console',
] as const;
export type Platform = (typeof PLATFORMS)[number];

export type Capability = 'verified' | 'partial' | 'unverified' | 'unavailable';
export type Role = 'admin' | 'editor' | 'viewer';
export type ContentType = 'video' | 'article';
export type ContentStatus = 'draft' | 'review' | 'approved' | 'partially_published' | 'published' | 'archived';
export type PublishingStatus = 'pending' | 'processing' | 'published' | 'needs_action' | 'manual_pending' | 'failed' | 'skipped';

export interface AuditFields {
  id: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  status: string;
}

export interface ConnectorRecord extends AuditFields {
  status: ConnectorStatus;
  platform: Platform;
  authenticationStatus: ConnectorStatus;
  publishingCapability: Capability;
  analyticsCapability: Capability;
  scopes: string[];
  quotaNotes: string;
  reviewStatus: ConnectorStatus;
  testedAt: string | null;
  testedBy: string | null;
  limitations: string[];
  recommendedMode: ConnectorMode;
  mode: ConnectorMode;
  adminOverride: boolean;
  lastError?: string;
}

export interface PlatformPublication {
  platform: Platform;
  status: PublishingStatus;
  mode: ConnectorMode;
  postUrl?: string;
  platformPostId?: string;
  publishedAt?: string;
  note?: string;
  lastError?: string;
}

export interface ContentRecord extends AuditFields {
  contentId: string;
  type: ContentType;
  title: string;
  topic: string;
  body: string;
  masterScript?: string;
  shortDescription?: string;
  fullDescription?: string;
  scheduledAt?: string;
  platforms: PlatformPublication[];
}

export interface HealthItem {
  key: string;
  label: string;
  status: 'operational' | 'partial' | 'configuration_required' | 'pending_review' | 'error' | 'manual';
  checkedAt: string;
  detail?: string;
}

export const connectorStatusVi: Record<ConnectorStatus, string> = {
  not_tested: 'Chưa kiểm tra', testing: 'Đang kiểm tra', available: 'Khả dụng',
  partially_available: 'Khả dụng một phần', manual_only: 'Chỉ thủ công',
  pending_review: 'Đang chờ phê duyệt', unavailable: 'Không khả dụng', error: 'Có lỗi',
};

export const connectorModeVi: Record<ConnectorMode, string> = {
  automatic: 'Tự động', semi_automatic: 'Bán tự động', manual: 'Thủ công',
};

export function recommendConnectorMode(status: ConnectorStatus): ConnectorMode {
  if (status === 'available') return 'automatic';
  if (status === 'partially_available' || status === 'testing' || status === 'pending_review') return 'semi_automatic';
  return 'manual';
}

export function aggregatePublishingStatus(publications: PlatformPublication[]): ContentStatus {
  if (publications.length === 0) return 'draft';
  const completed = publications.filter((item) => item.status === 'published').length;
  if (completed === publications.length) return 'published';
  if (completed > 0) return 'partially_published';
  return 'approved';
}

export const DEFAULT_CONNECTORS: ConnectorRecord[] = PLATFORMS.map((platform) => ({
  id: platform,
  platform,
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
  createdBy: 'system',
  status: 'not_tested',
  authenticationStatus: 'not_tested',
  publishingCapability: 'unverified',
  analyticsCapability: 'unverified',
  scopes: [],
  quotaNotes: 'Chưa xác minh bằng request thực tế.',
  reviewStatus: 'not_tested',
  testedAt: null,
  testedBy: null,
  limitations: ['Chưa thực hiện API Feasibility Test với credential production.'],
  recommendedMode: 'manual',
  mode: 'manual',
  adminOverride: false,
}));
