import { describe, expect, it } from 'vitest';
import type { ContentRecord, MediaAssetRecord } from '@ancv/shared';
import { assertWordPressDraftEligibility, wordpressDraftJobId } from '../src/services/wordpress-draft-safety.js';

const body = `Bảo vệ doanh nghiệp cần phù hợp nhu cầu vận hành. ${'Nội dung hữu ích cho người đọc. '.repeat(80)}\n\n## Nhu cầu thực tế\nPhân tích.\n\n### Phương án phù hợp\nPhân tích.\n\nLiên hệ ANCV để trao đổi.`;
const content = { id: 'article-1', contentId: 'ANCV-ART-2026-TEST', type: 'article', title: 'TEST', topic: 'Bảo vệ doanh nghiệp', body, status: 'approved', approvedAt: '2026-08-15T00:00:00Z', selectedImageId: 'image-1', createdAt: 'x', updatedAt: 'x', createdBy: 'editor', platforms: [], articleSeo: { seoTitle: 'Giải pháp bảo vệ doanh nghiệp phù hợp nhu cầu', h1: 'Giải pháp bảo vệ doanh nghiệp', slug: 'giai-phap-bao-ve-doanh-nghiep', metaDescription: 'Tìm hiểu cách lựa chọn giải pháp bảo vệ doanh nghiệp phù hợp với môi trường vận hành và nhu cầu an ninh thực tế.', focusKeyword: 'bảo vệ doanh nghiệp', suggestedInternalLinks: [], faq: [], imageAltTextSuggestions: ['Nhân viên bảo vệ tại nơi làm việc'] } } as ContentRecord;
const image = { id: 'image-1', contentDocId: 'article-1', contentId: content.contentId, kind: 'article_image', fileName: 'image.png', contentType: 'image/png', sizeBytes: 2048, altText: 'Nhân viên bảo vệ tại nơi làm việc', status: 'ready', createdAt: 'x', updatedAt: 'x', createdBy: 'editor' } as MediaAssetRecord;

describe('WordPress draft safety foundation', () => {
  it('uses one deterministic job ID per Article', () => expect(wordpressDraftJobId('article-1')).toBe('wordpress-draft-article-1'));
  it('requires approved SEO Article and featured image alt text', () => {
    expect(() => assertWordPressDraftEligibility(content, image)).not.toThrow();
    expect(() => assertWordPressDraftEligibility({ ...content, approvedAt: undefined, status: 'review' }, image)).toThrow('WORDPRESS_ARTICLE_APPROVAL_REQUIRED');
    expect(() => assertWordPressDraftEligibility(content, { ...image, altText: '' })).toThrow('WORDPRESS_FEATURED_IMAGE_ALT_REQUIRED');
  });
});
