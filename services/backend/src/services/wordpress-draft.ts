import { aggregatePublishingStatus, type ContentRecord, type MediaAssetRecord, type PlatformPublication, type WordPressDraftJobRecord, type WordPressDraftState, type WordPressPublishingJobRecord } from '@ancv/shared';
import { db, storageBucket } from '../firebase.js';
import { config } from '../config.js';
import { assertWordPressDraftEligibility, wordpressDraftJobId } from './wordpress-draft-safety.js';

type JsonRecord = Record<string, unknown>;

interface WordPressPost {
  id: number;
  status: string;
  slug: string;
  link?: string;
  title?: { raw?: string; rendered?: string };
  content?: { raw?: string; rendered?: string };
  featured_media?: number;
  date_gmt?: string;
}

interface WordPressMedia {
  id: number;
  slug: string;
  alt_text?: string;
  source_url?: string;
}

export interface WordPressDraftResult {
  job: WordPressDraftJobRecord;
  draft: WordPressDraftState;
  duplicateCount: number;
  idempotentReplay: boolean;
}

function httpError(message: string, statusCode: number): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode });
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function inlineMarkdown(value: string): string {
  return escapeHtml(value).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

export function markdownArticleToHtml(markdown: string, contentId: string): string {
  const blocks: string[] = [`<!-- ANCV-CONTENT-ID:${escapeHtml(contentId)} -->`];
  let list: string[] = [];
  const flushList = () => { if (list.length) { blocks.push(`<ul>${list.join('')}</ul>`); list = []; } };
  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) { flushList(); continue; }
    const heading = line.match(/^(#{2,3})\s+(.+)$/);
    if (heading) { flushList(); const level = heading[1]!.length; blocks.push(`<h${level}>${inlineMarkdown(heading[2]!)}</h${level}>`); continue; }
    const bullet = line.match(/^[-*]\s+(.+)$/);
    if (bullet) { list.push(`<li>${inlineMarkdown(bullet[1]!)}</li>`); continue; }
    flushList(); blocks.push(`<p>${inlineMarkdown(line)}</p>`);
  }
  flushList();
  return blocks.join('\n');
}

export function discoverWritableYoastFields(root: JsonRecord): { titleField?: string; descriptionField?: string } {
  const routes = root.routes as Record<string, { endpoints?: Array<{ methods?: string[]; args?: Record<string, unknown> }> }> | undefined;
  const create = routes?.['/wp/v2/posts']?.endpoints?.find((item) => item.methods?.includes('POST'));
  const args = create?.args ?? {};
  const meta = args.meta as { properties?: Record<string, unknown> } | undefined;
  const keys = new Set([...Object.keys(args), ...Object.keys(meta?.properties ?? {})]);
  const titleField = ['yoast_title', '_yoast_wpseo_title'].find((key) => keys.has(key));
  const descriptionField = ['yoast_description', '_yoast_wpseo_metadesc'].find((key) => keys.has(key));
  return { titleField, descriptionField };
}

function authHeader(): string {
  if (!config.wordpressUsername || !config.wordpressApplicationPassword) throw httpError('WORDPRESS_CREDENTIAL_NOT_CONFIGURED', 503);
  return `Basic ${Buffer.from(`${config.wordpressUsername}:${config.wordpressApplicationPassword}`).toString('base64')}`;
}

async function wpRequest<T>(baseUrl: string, path: string, init: RequestInit = {}, timeoutMs = 60_000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(new URL(path, `${baseUrl}/`), {
      ...init,
      signal: controller.signal,
      headers: { authorization: authHeader(), accept: 'application/json', ...init.headers },
      redirect: 'error',
    });
    const payload = await response.json().catch(() => ({})) as JsonRecord;
    if (!response.ok) throw httpError(`WORDPRESS_HTTP_${response.status}:${String(payload.code ?? 'UNKNOWN')}`, response.status >= 500 ? 502 : 409);
    return payload as T;
  } finally { clearTimeout(timer); }
}

function exactBaseUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.origin !== 'https://anninhcanhve.com') throw httpError('WORDPRESS_SITE_MISMATCH', 409);
  return url.origin;
}

async function findPosts(baseUrl: string, slug: string): Promise<WordPressPost[]> {
  return wpRequest<WordPressPost[]>(baseUrl, `/wp-json/wp/v2/posts?context=edit&status=any&per_page=100&slug=${encodeURIComponent(slug)}`);
}

async function findMedia(baseUrl: string, slug: string): Promise<WordPressMedia[]> {
  return wpRequest<WordPressMedia[]>(baseUrl, `/wp-json/wp/v2/media?context=edit&per_page=100&slug=${encodeURIComponent(slug)}`);
}

function hasMarker(post: WordPressPost, contentId: string): boolean {
  return String(post.content?.raw ?? post.content?.rendered ?? '').includes(`ANCV-CONTENT-ID:${contentId}`);
}

async function verifyDraft(baseUrl: string, postId: number, mediaId: number, expected: { slug: string; title: string; altText: string; contentId: string }): Promise<{ post: WordPressPost; media: WordPressMedia; duplicateCount: number }> {
  const post = await wpRequest<WordPressPost>(baseUrl, `/wp-json/wp/v2/posts/${postId}?context=edit`);
  const media = await wpRequest<WordPressMedia>(baseUrl, `/wp-json/wp/v2/media/${mediaId}?context=edit`);
  const duplicates = (await findPosts(baseUrl, expected.slug)).filter((item) => hasMarker(item, expected.contentId));
  if (post.status !== 'draft' || post.slug !== expected.slug || post.featured_media !== mediaId || !hasMarker(post, expected.contentId)) throw httpError('WORDPRESS_DRAFT_VERIFICATION_FAILED', 502);
  if ((post.title?.raw ?? post.title?.rendered ?? '').trim() !== expected.title.trim()) throw httpError('WORDPRESS_DRAFT_TITLE_MISMATCH', 502);
  if ((media.alt_text ?? '').trim() !== expected.altText.trim()) throw httpError('WORDPRESS_MEDIA_ALT_MISMATCH', 502);
  if (duplicates.length !== 1) throw httpError('WORDPRESS_DRAFT_DUPLICATE_DETECTED', 409);
  return { post, media, duplicateCount: duplicates.length };
}

async function completeDraft(jobRef: FirebaseFirestore.DocumentReference, content: ContentRecord, uid: string, baseUrl: string, post: WordPressPost, media: WordPressMedia, yoastMetadata: 'synced' | 'not_synced', duplicateCount: number): Promise<WordPressDraftResult> {
  const now = new Date().toISOString();
  const draft: WordPressDraftState = { siteUrl: baseUrl, postId: post.id, featuredMediaId: media.id, status: 'draft', slug: post.slug, postUrl: post.link, yoastMetadata, createdAt: now, createdBy: uid };
  const completed: Partial<WordPressDraftJobRecord> = { status: 'succeeded', wordpressPostId: post.id, wordpressMediaId: media.id, yoastMetadata, completedAt: now, updatedAt: now, error: null };
  const batch = db().batch();
  batch.set(jobRef, completed, { merge: true });
  batch.update(db().collection('contents').doc(content.id), { wordpressDraft: draft, updatedAt: now });
  const auditRef = db().collection('auditLogs').doc();
  batch.set(auditRef, { id: auditRef.id, status: 'recorded', action: 'wordpress.draft.create', entityType: 'content', entityId: content.id, detail: { postId: post.id, mediaId: media.id, siteUrl: baseUrl, duplicateCount, yoastMetadata }, createdAt: now, updatedAt: now, createdBy: uid });
  await batch.commit();
  const snapshot = await jobRef.get();
  return { job: snapshot.data() as WordPressDraftJobRecord, draft, duplicateCount, idempotentReplay: false };
}

export async function createWordPressDraft(contentDocId: string, uid: string): Promise<WordPressDraftResult> {
  const contentSnapshot = await db().collection('contents').doc(contentDocId).get();
  if (!contentSnapshot.exists) throw httpError('CONTENT_NOT_FOUND', 404);
  const content = { id: contentSnapshot.id, ...contentSnapshot.data() } as ContentRecord;
  if (!content.selectedImageId) throw httpError('WORDPRESS_FEATURED_IMAGE_REQUIRED', 409);
  const assetSnapshot = await db().collection('mediaAssets').doc(content.selectedImageId).get();
  if (!assetSnapshot.exists) throw httpError('WORDPRESS_FEATURED_IMAGE_NOT_FOUND', 409);
  const asset = { id: assetSnapshot.id, ...assetSnapshot.data() } as MediaAssetRecord;
  assertWordPressDraftEligibility(content, asset);

  const baseUrl = exactBaseUrl(config.wordpressBaseUrl);
  const root = await wpRequest<JsonRecord>(baseUrl, '/wp-json/');
  if (new URL(String(root.url ?? '')).origin !== baseUrl) throw httpError('WORDPRESS_SITE_MISMATCH', 409);
  const seo = content.articleSeo!;
  const title = seo.seoTitle.trim() || seo.h1.trim() || content.title.trim();
  const existingPosts = await findPosts(baseUrl, seo.slug);
  const ownedPosts = existingPosts.filter((item) => hasMarker(item, content.contentId));
  if (existingPosts.length > 0 && ownedPosts.length === 0) throw httpError('WORDPRESS_SLUG_CONFLICT', 409);

  const jobRef = db().collection('publishingJobs').doc(wordpressDraftJobId(content.id));
  const existingJob = await jobRef.get();
  if (existingJob.exists) {
    const job = existingJob.data() as WordPressDraftJobRecord;
    const post = ownedPosts.find((item) => item.id === job.wordpressPostId) ?? ownedPosts[0];
    if (post && job.wordpressMediaId) {
      const verified = await verifyDraft(baseUrl, post.id, job.wordpressMediaId, { slug: seo.slug, title, altText: asset.altText!, contentId: content.contentId });
      const draft: WordPressDraftState = { siteUrl: baseUrl, postId: post.id, featuredMediaId: job.wordpressMediaId, status: 'draft', slug: post.slug, postUrl: post.link, yoastMetadata: job.yoastMetadata ?? 'not_synced', createdAt: job.completedAt ?? job.createdAt, createdBy: job.createdBy };
      return { job, draft, duplicateCount: verified.duplicateCount, idempotentReplay: true };
    }
    throw httpError('WORDPRESS_DRAFT_JOB_REQUIRES_MANUAL_REVIEW', 409);
  }

  const now = new Date().toISOString();
  const job: WordPressDraftJobRecord = { id: jobRef.id, platform: 'website', operation: 'create_draft', contentDocId: content.id, contentId: content.contentId, assetId: asset.id, idempotencyKey: jobRef.id, status: 'processing', siteUrl: baseUrl, slug: seo.slug, createdAt: now, updatedAt: now, createdBy: uid, error: null };
  await jobRef.create(job);

  const mediaSlug = `${content.contentId.toLowerCase()}-featured-image`;
  let media: WordPressMedia;
  try {
    const existingMedia = await findMedia(baseUrl, mediaSlug);
    if (existingMedia.length > 1) throw httpError('WORDPRESS_MEDIA_DUPLICATE_DETECTED', 409);
    if (existingMedia.length === 1) media = existingMedia[0]!;
    else {
      const mediaIntentAt = new Date().toISOString();
      await jobRef.update({ mediaIntentAt, updatedAt: mediaIntentAt });
      if (!asset.storagePath || asset.storageType === 'local') throw httpError('WORDPRESS_FIREBASE_IMAGE_REQUIRED', 409);
      const [bytes] = await storageBucket().file(asset.storagePath).download();
      if (!bytes.length) throw httpError('WORDPRESS_IMAGE_EMPTY', 409);
      const extension = asset.fileName.match(/\.[a-z0-9]+$/i)?.[0] ?? '.png';
      const params = new URLSearchParams({ slug: mediaSlug, title: `${content.contentId} featured image`, alt_text: asset.altText!, ...(asset.caption ? { caption: asset.caption } : {}) });
      try {
        media = await wpRequest<WordPressMedia>(baseUrl, `/wp-json/wp/v2/media?${params}`, { method: 'POST', headers: { 'content-type': asset.contentType, 'content-disposition': `attachment; filename="${content.contentId.toLowerCase()}-featured-image${extension}"` }, body: Uint8Array.from(bytes) }, 120_000);
      } catch (error) {
        const recovered = await findMedia(baseUrl, mediaSlug);
        if (recovered.length !== 1) throw error;
        media = recovered[0]!;
      }
    }
    await jobRef.update({ wordpressMediaId: media.id, updatedAt: new Date().toISOString() });

    const writableYoast = discoverWritableYoastFields(root);
    const yoastMetadata = writableYoast.titleField && writableYoast.descriptionField ? 'synced' : 'not_synced';
    const meta: Record<string, string> = {};
    if (writableYoast.titleField) meta[writableYoast.titleField] = seo.seoTitle;
    if (writableYoast.descriptionField) meta[writableYoast.descriptionField] = seo.metaDescription;
    const payload: JsonRecord = { status: 'draft', title, content: markdownArticleToHtml(content.body, content.contentId), slug: seo.slug, excerpt: seo.metaDescription, featured_media: media.id, ...(Object.keys(meta).length ? { meta } : {}) };
    const postIntentAt = new Date().toISOString();
    await jobRef.update({ postIntentAt, updatedAt: postIntentAt });
    let post: WordPressPost;
    try {
      post = await wpRequest<WordPressPost>(baseUrl, '/wp-json/wp/v2/posts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) }, 120_000);
    } catch (error) {
      const recovered = (await findPosts(baseUrl, seo.slug)).filter((item) => hasMarker(item, content.contentId));
      if (recovered.length !== 1) throw error;
      post = recovered[0]!;
    }
    const verified = await verifyDraft(baseUrl, post.id, media.id, { slug: seo.slug, title, altText: asset.altText!, contentId: content.contentId });
    return completeDraft(jobRef, content, uid, baseUrl, verified.post, verified.media, yoastMetadata, verified.duplicateCount);
  } catch (error) {
    await jobRef.set({ status: 'needs_manual', error: error instanceof Error ? error.message : 'WORDPRESS_DRAFT_UNKNOWN_ERROR', updatedAt: new Date().toISOString() }, { merge: true });
    throw error;
  }
}

export const createWordPressDraftUat = createWordPressDraft;

export function wordpressPublishJobId(contentDocId: string): string {
  return `wordpress-publish-${contentDocId}`;
}

export function wordpressPublishPayload(mode: 'now' | 'schedule', scheduledAt?: string): JsonRecord {
  if (mode === 'now') return { status: 'publish' };
  if (!scheduledAt || !Number.isFinite(Date.parse(scheduledAt)) || Date.parse(scheduledAt) <= Date.now()) throw httpError('WORDPRESS_SCHEDULE_INVALID', 409);
  return { status: 'future', date_gmt: new Date(scheduledAt).toISOString().replace(/\.\d{3}Z$/, '') };
}

function updateWebsitePublication(current: PlatformPublication[], mode: 'now' | 'schedule', now: string, scheduledAt?: string): PlatformPublication[] {
  const changes: PlatformPublication = {
    platform: 'website', mode: 'semi_automatic', status: mode === 'schedule' ? 'scheduled' : 'published',
    ...(mode === 'schedule' ? { scheduledAt } : { publishedAt: now }),
  };
  return current.some((item) => item.platform === 'website')
    ? current.map((item) => item.platform === 'website' ? { ...item, ...changes } : item)
    : [...current, changes];
}

function scheduledTimeMatches(post: WordPressPost, scheduledAt?: string): boolean {
  if (!scheduledAt) return true;
  const raw = post.date_gmt ?? '';
  const actual = Date.parse(raw.endsWith('Z') ? raw : `${raw}Z`);
  return Number.isFinite(actual) && Math.abs(actual - Date.parse(scheduledAt)) < 1_000;
}

export async function publishWordPressContent(contentDocId: string, uid: string, mode: 'now' | 'schedule', scheduledAt?: string) {
  let snapshot = await db().collection('contents').doc(contentDocId).get();
  if (!snapshot.exists) throw httpError('CONTENT_NOT_FOUND', 404);
  let content = { id: snapshot.id, ...snapshot.data() } as ContentRecord;
  if (content.type !== 'article' || !content.approvedAt || !['approved', 'ready_to_publish', 'partially_published', 'scheduled'].includes(content.status)) throw httpError('WORDPRESS_ARTICLE_APPROVAL_REQUIRED', 409);
  if (!content.wordpressDraft?.postId) {
    await createWordPressDraft(contentDocId, uid);
    snapshot = await db().collection('contents').doc(contentDocId).get();
    content = { id: snapshot.id, ...snapshot.data() } as ContentRecord;
  }
  if (!content.wordpressDraft?.postId) throw httpError('WORDPRESS_DRAFT_REQUIRED', 409);
  const baseUrl = exactBaseUrl(config.wordpressBaseUrl);
  if (exactBaseUrl(content.wordpressDraft.siteUrl) !== baseUrl) throw httpError('WORDPRESS_SITE_MISMATCH', 409);
  const payload = wordpressPublishPayload(mode, scheduledAt);
  const expectedStatus = mode === 'schedule' ? 'future' : 'publish';
  const jobRef = db().collection('publishingJobs').doc(wordpressPublishJobId(content.id));
  const existing = await jobRef.get();
  if (existing.exists) {
    const job = existing.data() as WordPressPublishingJobRecord;
    const post = await wpRequest<WordPressPost>(baseUrl, `/wp-json/wp/v2/posts/${content.wordpressDraft.postId}?context=edit`);
    if (job.status === 'succeeded' && post.status === expectedStatus && hasMarker(post, content.contentId) && scheduledTimeMatches(post, scheduledAt)) {
      return { job, wordpress: content.wordpressDraft, idempotentReplay: true };
    }
    throw httpError('WORDPRESS_PUBLISH_JOB_REQUIRES_MANUAL_REVIEW', 409);
  }
  const now = new Date().toISOString();
  const job: WordPressPublishingJobRecord = {
    id: jobRef.id, platform: 'website', operation: mode === 'schedule' ? 'schedule' : 'publish_now',
    contentDocId: content.id, contentId: content.contentId, wordpressPostId: content.wordpressDraft.postId,
    idempotencyKey: jobRef.id, status: 'processing', ...(scheduledAt ? { scheduledAt } : {}),
    createdAt: now, updatedAt: now, createdBy: uid, error: null,
  };
  try {
    await jobRef.create(job);
  } catch (error) {
    const concurrent = await jobRef.get();
    if (concurrent.exists) throw httpError('WORDPRESS_PUBLISH_JOB_ALREADY_RUNNING', 409);
    throw error;
  }
  try {
    const before = await wpRequest<WordPressPost>(baseUrl, `/wp-json/wp/v2/posts/${content.wordpressDraft.postId}?context=edit`);
    if (!hasMarker(before, content.contentId)) throw httpError('WORDPRESS_POST_IDENTITY_MISMATCH', 409);
    let post: WordPressPost;
    try {
      post = await wpRequest<WordPressPost>(baseUrl, `/wp-json/wp/v2/posts/${before.id}`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
      }, 120_000);
    } catch (error) {
      const recovered = await wpRequest<WordPressPost>(baseUrl, `/wp-json/wp/v2/posts/${before.id}?context=edit`);
      if (recovered.status !== expectedStatus || !scheduledTimeMatches(recovered, scheduledAt)) throw error;
      post = recovered;
    }
    const verified = await wpRequest<WordPressPost>(baseUrl, `/wp-json/wp/v2/posts/${post.id}?context=edit`);
    if (verified.id !== before.id || verified.status !== expectedStatus || !hasMarker(verified, content.contentId) || !scheduledTimeMatches(verified, scheduledAt)) throw httpError('WORDPRESS_PUBLISH_VERIFICATION_FAILED', 502);
    const completedAt = new Date().toISOString();
    const wordpress: WordPressDraftState = {
      ...content.wordpressDraft, status: expectedStatus,
      ...(mode === 'schedule' ? { scheduledAt } : { publishedAt: completedAt }),
    };
    const platforms = updateWebsitePublication(content.platforms ?? [], mode, completedAt, scheduledAt);
    const completed: Partial<WordPressPublishingJobRecord> = { status: 'succeeded', completedAt, updatedAt: completedAt, error: null };
    const batch = db().batch();
    batch.set(jobRef, completed, { merge: true });
    batch.update(snapshot.ref, { wordpressDraft: wordpress, platforms, status: mode === 'schedule' ? 'scheduled' : aggregatePublishingStatus(platforms), updatedAt: completedAt });
    const auditRef = db().collection('auditLogs').doc();
    batch.set(auditRef, { id: auditRef.id, status: 'recorded', action: mode === 'schedule' ? 'wordpress.schedule' : 'wordpress.publish', entityType: 'content', entityId: content.id, detail: { postId: verified.id, siteUrl: baseUrl, ...(scheduledAt ? { scheduledAt } : {}) }, createdAt: completedAt, updatedAt: completedAt, createdBy: uid });
    await batch.commit();
    return { job: { ...job, ...completed }, wordpress, idempotentReplay: false };
  } catch (error) {
    await jobRef.set({ status: 'needs_manual', error: error instanceof Error ? error.message : 'WORDPRESS_PUBLISH_UNKNOWN_ERROR', updatedAt: new Date().toISOString() }, { merge: true });
    throw error;
  }
}
