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
export type FlowJobStage =
  | 'queued'
  | 'opening_flow'
  | 'filling_prompt'
  | 'generating'
  | 'waiting_output'
  | 'output_detected'
  | 'output_rendering'
  | 'output_ready'
  | 'download_ready'
  | 'downloading'
  | 'completed'
  | 'needs_manual';
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
  articleSeo?: ArticleSeoData;
}

export interface ArticleSeoFaq {
  question: string;
  answer: string;
}

export interface ArticleSeoData {
  seoTitle: string;
  h1: string;
  slug: string;
  metaDescription: string;
  focusKeyword: string;
  suggestedInternalLinks: string[];
  faq: ArticleSeoFaq[];
  imageAltTextSuggestions: string[];
}

export interface SeoQualityItem {
  key: 'seo_title' | 'meta_description' | 'h1' | 'headings' | 'focus_keyword' | 'keyword_natural' | 'cta' | 'alt_text' | 'slug';
  label: string;
  passed: boolean;
}

export interface SeoQualityResult {
  checks: SeoQualityItem[];
  warnings: string[];
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
  source?: 'manual_upload' | 'manual_local' | 'google_flow_worker' | 'google_flow' | 'openai';
  flowAccountId?: string;
  flowJobId?: string;
  executionEngine?: 'playwright_fallback';
  outputId?: string;
  fileSize?: number;
  mimeType?: string;
  checksumSha256?: string;
  altText?: string;
  caption?: string;
  mediaTitle?: string;
}

export interface LocalFinalCandidate {
  relativePath: string;
  fileName: string;
  sizeBytes: number;
  contentType: string;
  checksumSha256?: string;
}

export interface PublishingJobRecord extends AuditFields {
  platform: 'youtube';
  contentDocId: string;
  contentId: string;
  assetId: string;
  idempotencyKey: string;
  privacyStatus: 'private';
  status: 'staging' | 'staged' | 'uploading' | 'succeeded' | 'needs_manual';
  stagingPath?: string;
  stagingCleanup?: 'pending' | 'completed' | 'failed';
  uploadIntentAt?: string;
  videoId?: string;
  postUrl?: string;
  channelId?: string;
  error?: string | null;
  completedAt?: string;
}

export interface FlowAccountRecord extends AuditFields {
  status: FlowAccountStatus;
  label: string;
  email?: string;
  expectedAccount?: string;
  verifiedAccount?: string;
  verifiedAt?: string;
  projectUrl?: string;
  profileKind?: 'managed' | 'system';
  managedProfileId?: string;
  chromeProfileId?: string;
  lastCheckedAt?: string;
  limitation?: string;
}

export interface FlowJobRecord extends AuditFields {
  status: FlowJobStatus;
  stage?: FlowJobStage;
  contentDocId: string;
  contentId: string;
  sceneId: string;
  sceneNumber: number;
  prompt: string;
  durationEstimate?: number;
  aspectRatio?: '9:16' | '16:9';
  flowAccountId: string;
  flowProjectUrl: string;
  expectedAccount?: string;
  profileKind?: 'managed' | 'system';
  managedProfileId?: string;
  chromeProfileId?: string;
  flowAccountEmail?: string;
  attempt: number;
  error?: string | null;
  startedAt?: string;
  completedAt?: string;
  generateIntentAt?: string;
  generateClicks?: number;
  generateInputMethod?: 'dom' | 'cdp_mouse' | 'playwright' | 'computer_use_uat';
  generationAcceptanceSignal?: boolean;
  generationRequestObserved?: boolean;
  generationResponseStatus?: number | null;
  processingObserved?: boolean;
  baselineOutputIds?: string[];
  flowDetailId?: string;
  assetId?: string;
  executionMode?: 'local_agent' | 'playwright_fallback';
  executionEngine?: 'playwright_fallback';
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
  command: 'open_folder' | 'open_file' | 'scan_profiles' | 'validate_profile' | 'scan_video_final' | 'register_video_final' | 'stage_youtube_final';
  relativePath?: string;
  contentDocId?: string;
  contentId?: string;
  publishingJobId?: string;
  stagingPath?: string;
  platform?: BrowserPlatform;
  chromeProfileId?: string;
  result?: Record<string, unknown>;
  error?: string | null;
  completedAt?: string;
}

export const BROWSER_PLATFORMS = ['google_flow', 'facebook', 'tiktok', 'linkedin', 'zalo'] as const;
export type BrowserPlatform = (typeof BROWSER_PLATFORMS)[number];
export type BrowserProfileStatus = 'ready' | 'login_required' | 'bridge_required' | 'unavailable' | 'not_tested';
export type BrowserPlatformStatus = 'not_configured' | 'ready_for_write_test' | 'login_required' | 'verification_required' | 'unavailable' | 'not_tested';

export interface ChromeProfileMetadata {
  chromeProfileId: string;
  profileLabel: string;
  email?: string;
  detectedAt: string;
}

export interface BrowserProfileMapping {
  platform: BrowserPlatform;
  machineId: string;
  chromeProfileId: string;
  profileLabel: string;
  updatedAt: string;
  updatedBy: string;
}

export interface BrowserProfileValidation {
  profileStatus: BrowserProfileStatus;
  platformStatus: BrowserPlatformStatus;
  validatedAt: string;
  chromeProfileId: string;
  detail?: string | null;
  detectedAccount?: string | null;
  detectedEntity?: string | null;
}

export interface BrowserProfileSettings {
  id: 'browserProfiles';
  status: 'active';
  machineId: string;
  profiles: ChromeProfileMetadata[];
  mappings: Partial<Record<BrowserPlatform, BrowserProfileMapping>>;
  validations?: Partial<Record<BrowserPlatform, BrowserProfileValidation>>;
  lastScanAt?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
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

export function isValidArticleSlug(value: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

function normalizedOccurrences(text: string, keyword: string): number {
  const normalizedText = text.normalize('NFC').toLocaleLowerCase('vi');
  const normalizedKeyword = keyword.trim().normalize('NFC').toLocaleLowerCase('vi');
  if (!normalizedKeyword) return 0;
  return normalizedText.split(normalizedKeyword).length - 1;
}

export function evaluateArticleSeo(input: { seo?: Partial<ArticleSeoData>; body: string; selectedImageAltText?: string }): SeoQualityResult {
  const seo = input.seo ?? {};
  const body = input.body.trim();
  const keyword = seo.focusKeyword?.trim() ?? '';
  const keywordCount = normalizedOccurrences(`${seo.seoTitle ?? ''}\n${seo.h1 ?? ''}\n${body}`, keyword);
  const wordCount = body.split(/\s+/).filter(Boolean).length;
  const keywordNatural = Boolean(keyword) && keywordCount >= 1 && keywordCount <= Math.max(4, Math.ceil(wordCount * 0.03));
  const hasHeadings = /^#{2,3}\s+\S+/m.test(body);
  const hasCta = /\b(liên hệ|đăng ký|tìm hiểu|gọi|trao đổi|nhận tư vấn)\b/iu.test(body);
  const checks: SeoQualityItem[] = [
    { key: 'seo_title', label: 'Có SEO Title', passed: Boolean(seo.seoTitle?.trim()) },
    { key: 'meta_description', label: 'Có Meta Description', passed: Boolean(seo.metaDescription?.trim()) },
    { key: 'h1', label: 'Có H1', passed: Boolean(seo.h1?.trim()) },
    { key: 'headings', label: 'Có H2/H3', passed: hasHeadings },
    { key: 'focus_keyword', label: 'Có Focus Keyword', passed: Boolean(keyword) },
    { key: 'keyword_natural', label: 'Focus Keyword xuất hiện tự nhiên', passed: keywordNatural },
    { key: 'cta', label: 'Có CTA', passed: hasCta },
    { key: 'alt_text', label: 'Có Alt Text cho ảnh đã chọn', passed: Boolean(input.selectedImageAltText?.trim()) },
    { key: 'slug', label: 'Slug hợp lệ', passed: isValidArticleSlug(seo.slug?.trim() ?? '') },
  ];
  const warnings: string[] = [];
  const titleLength = seo.seoTitle?.trim().length ?? 0;
  const metaLength = seo.metaDescription?.trim().length ?? 0;
  if (titleLength > 0 && (titleLength < 30 || titleLength > 65)) warnings.push('SEO Title nên nằm trong khoảng 30–65 ký tự.');
  if (metaLength > 0 && (metaLength < 90 || metaLength > 170)) warnings.push('Meta Description nên nằm trong khoảng 90–170 ký tự.');
  if (!hasHeadings) warnings.push('Article chưa có heading H2/H3.');
  if (keyword && keywordCount > Math.max(4, Math.ceil(wordCount * 0.03))) warnings.push('Focus Keyword có dấu hiệu lặp quá mức.');
  if (wordCount > 0 && wordCount < 450) warnings.push('Article có thể quá mỏng; hãy kiểm tra search intent trước khi duyệt.');
  if (!input.selectedImageAltText?.trim()) warnings.push('Ảnh chính chưa có Alt Text.');
  return { checks, warnings };
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
