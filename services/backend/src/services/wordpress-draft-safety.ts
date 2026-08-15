import { evaluateArticleSeo, type ContentRecord, type MediaAssetRecord } from '@ancv/shared';

export function wordpressDraftJobId(contentDocId: string): string {
  return `wordpress-draft-${contentDocId}`;
}

export function assertWordPressDraftEligibility(content: ContentRecord, image?: MediaAssetRecord): void {
  if (content.type !== 'article') throw new Error('WORDPRESS_ARTICLE_REQUIRED');
  if (!content.approvedAt || !['approved', 'ready_to_publish', 'partially_published', 'published'].includes(content.status)) throw new Error('WORDPRESS_ARTICLE_APPROVAL_REQUIRED');
  if (!content.selectedImageId || image?.id !== content.selectedImageId || !image.altText?.trim()) throw new Error('WORDPRESS_FEATURED_IMAGE_ALT_REQUIRED');
  const quality = evaluateArticleSeo({ seo: content.articleSeo, body: content.body, selectedImageAltText: image.altText });
  if (quality.checks.some((item) => !item.passed)) throw new Error('WORDPRESS_SEO_GATE_FAILED');
}
