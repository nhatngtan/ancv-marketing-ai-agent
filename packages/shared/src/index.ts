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
export const CONTENT_STATUSES = [
  'idea', 'draft', 'generating', 'in_production', 'post_production', 'awaiting_copy',
  'review', 'approved', 'ready_to_publish', 'scheduled', 'partially_published',
  'published', 'archived', 'test',
] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];
export type PublishingStatus = 'pending' | 'processing' | 'published' | 'needs_action' | 'manual_pending' | 'failed' | 'skipped';
export type AIJobStatus = 'queued' | 'processing' | 'succeeded' | 'failed';
export type FlowAccountStatus = 'ready' | 'needs_login' | 'needs_verification' | 'unavailable';
export type FlowJobStatus = 'queued' | 'processing' | 'succeeded' | 'needs_manual';
export type LocalAgentStatus = 'online' | 'offline' | 'starting' | 'error';
export type AIOperation = 'scene_breakdown' | 'scene_regeneration' | 'flow_prompt' | 'video_social_copy' | 'article_generation' | 'article_platform_copy' | 'image_generation' | 'report_analysis';

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
  testContent?: boolean;
  objective?: string;
  sourceMaterial?: string;
  notes?: string;
  desiredLength?: string;
  platformCopies?: Partial<Record<Platform, PlatformCopy>>;
  characterReferences?: CharacterReference[];
  visualStyle?: VisualStyle;
  selectedImageId?: string;
  finalVideoAssetId?: string;
  approvedAt?: string;
  approvedBy?: string;
  flowProjectUrl?: string;
}

export interface PlatformCopy {
  platform: Platform;
  title?: string;
  text: string;
  status: 'draft' | 'approved';
  generatedAt?: string;
  generatedBy?: string;
  editedAt?: string;
  approvedAt?: string;
  approvedBy?: string;
  version: number;
}

export interface CharacterReference {
  id: string;
  name: string;
  description?: string;
  appearance?: string;
  wardrobe?: string;
  notes?: string;
  imageUrl?: string;
}

export interface VisualStyle {
  style?: string;
  lighting?: string;
  colors?: string;
  cameraStyle?: string;
  aspectRatio?: string;
  continuityInstructions?: string;
}

export interface SceneRecord extends AuditFields {
  contentDocId: string;
  sceneNumber: number;
  title: string;
  durationEstimate: number;
  narration: string;
  visualDescription: string;
  cameraDirection: string;
  environment: string;
  characters: string[];
  continuityNotes: string;
  generationPrompt: string;
  status: 'draft' | 'approved' | 'used';
  flowJobId?: string;
  flowStatus?: FlowJobStatus;
  lastFlowAssetId?: string;
}

export interface MediaAssetRecord extends AuditFields {
  contentDocId: string;
  contentId: string;
  kind: 'scene_take' | 'video_final' | 'article_image';
  storageType?: 'local' | 'firebase';
  storagePath?: string;
  relativePath?: string;
  downloadUrl?: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  sceneId?: string;
  takeNumber?: number;
  selected?: boolean;
  prompt?: string;
  model?: string;
  quality?: string;
  usage?: AIUsageTokens;
  source?: 'manual_upload' | 'google_flow_worker' | 'google_flow' | 'openai';
  flowAccountId?: string;
  flowJobId?: string;
}

export interface FlowAccountRecord extends AuditFields {
  status: FlowAccountStatus;
  label: string;
  email?: string;
  projectUrl?: string;
  lastCheckedAt?: string;
  limitation?: string;
}

export interface FlowJobRecord extends AuditFields {
  status: FlowJobStatus;
  contentDocId: string;
  contentId: string;
  sceneId: string;
  sceneNumber: number;
  prompt: string;
  flowAccountId: string;
  flowProjectUrl: string;
  attempt: number;
  error?: string | null;
  startedAt?: string;
  completedAt?: string;
  generateIntentAt?: string;
  assetId?: string;
  executionMode?: 'local_agent' | 'playwright_fallback';
  storageStrategy?: 'local_first' | 'firebase';
  workerInstanceId?: string | number;
}

export interface LocalAgentRecord extends AuditFields {
  status: LocalAgentStatus;
  machineName: string;
  lastSeen: string;
  bridgeStatus: 'connected' | 'disconnected';
  currentProfileId?: string | null;
  workspaceAvailable: boolean;
  version: string;
  limitation?: string | null;
}

export interface LocalCommandRecord extends AuditFields {
  status: 'queued' | 'processing' | 'succeeded' | 'needs_manual';
  agentId: string;
  command: 'open_folder' | 'open_file';
  relativePath: string;
  error?: string | null;
  completedAt?: string;
}

export interface AIUsageTokens {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
}

export interface AIUsageRecord extends AuditFields, AIUsageTokens {
  operation: AIOperation;
  model: string;
  contentDocId?: string;
  jobId: string;
  requestId?: string | null;
  imageCount?: number;
}

export interface CompanyProfile {
  companyName: string;
  brandName: string;
  website: string;
  introduction: string;
  services: string;
  serviceAreas: string;
  contact: string;
  toneOfVoice: string;
  defaultCta: string;
  approvedFacts: string;
  updatedAt?: string;
  updatedBy?: string;
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
