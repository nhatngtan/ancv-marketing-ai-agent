import { describe, expect, it, vi } from 'vitest';
import { evaluateArticleSeo, type ContentRecord, type Platform } from '@ancv/shared';
import { generateArticleSocialCopies } from './lib/repository';
import { articleSaveStateLabel, shouldConfirmArticleRegeneration } from './lib/article-seo';

const article = { id: 'article-1', contentId: 'ANCV-ART-2026-TEST', type: 'article', title: 'TEST', topic: 'Bảo vệ doanh nghiệp', body: 'Mở bài về bảo vệ doanh nghiệp.\n\n## Nhu cầu an ninh\nNội dung hữu ích.\n\n### Giải pháp phù hợp\nLiên hệ ANCV để trao đổi.', status: 'review', createdAt: 'x', updatedAt: 'x', createdBy: 'editor', platforms: [], platformCopies: {}, articleSeo: { seoTitle: 'Giải pháp bảo vệ doanh nghiệp phù hợp nhu cầu', h1: 'Giải pháp bảo vệ doanh nghiệp', slug: 'giai-phap-bao-ve-doanh-nghiep', metaDescription: 'Tìm hiểu cách lựa chọn giải pháp bảo vệ doanh nghiệp phù hợp với nhu cầu vận hành và môi trường làm việc thực tế.', focusKeyword: 'bảo vệ doanh nghiệp', suggestedInternalLinks: [], faq: [], imageAltTextSuggestions: ['Nhân viên bảo vệ tại khu vực làm việc'] } } as ContentRecord;

describe('Article SEO workflow', () => {
  it('evaluates deterministic SEO checklist without claiming a ranking score', () => {
    const result = evaluateArticleSeo({ seo: article.articleSeo, body: article.body, selectedImageAltText: 'Nhân viên bảo vệ tại khu vực làm việc' });
    expect(result.checks.find((item) => item.key === 'slug')?.passed).toBe(true);
    expect(result.checks.find((item) => item.key === 'alt_text')?.passed).toBe(true);
  });

  it('generates social copies sequentially from the saved Article and keeps partial success', async () => {
    const order: Platform[] = [];
    const generator = vi.fn(async (_id: string, platform: Platform) => { order.push(platform); if (platform === 'zalo') throw new Error('ZALO_FAIL'); });
    const result = await generateArticleSocialCopies(article, generator);
    expect(order).toEqual(['facebook', 'zalo', 'linkedin']);
    expect(result.succeeded).toEqual(['facebook', 'linkedin']);
    expect(result.failed).toEqual([{ platform: 'zalo', message: 'ZALO_FAIL' }]);
  });

  it('does not overwrite an existing social copy', async () => {
    const generator = vi.fn(async () => undefined);
    await generateArticleSocialCopies({ ...article, platformCopies: { facebook: { platform: 'facebook', text: 'Giữ nguyên', status: 'draft', version: 1 } } }, generator);
    expect(generator.mock.calls).toHaveLength(2);
  });

  it('keeps autosave errors visible and requires confirmation before overwrite', () => {
    expect(articleSaveStateLabel('error')).toContain('Lỗi lưu');
    expect(shouldConfirmArticleRegeneration('Nội dung đã biên tập')).toBe(true);
    expect(shouldConfirmArticleRegeneration('   ')).toBe(false);
  });
});
