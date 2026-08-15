import { describe, expect, it } from 'vitest';
import { discoverWritableYoastFields, markdownArticleToHtml } from '../src/services/wordpress-draft.js';

describe('WordPress draft payload safety', () => {
  it('converts canonical markdown and embeds the idempotency marker safely', () => {
    const html = markdownArticleToHtml('Mở bài **quan trọng**.\n\n## Tiêu chí\n- Mục một\n- <script>x</script>', 'ANCV-ART-2026-002');
    expect(html).toContain('<!-- ANCV-CONTENT-ID:ANCV-ART-2026-002 -->');
    expect(html).toContain('<h2>Tiêu chí</h2>');
    expect(html).toContain('<strong>quan trọng</strong>');
    expect(html).toContain('<ul><li>Mục một</li><li>&lt;script&gt;x&lt;/script&gt;</li></ul>');
    expect(html).not.toContain('<script>');
  });

  it('does not treat Yoast read-only response fields as writeable', () => {
    const root = { routes: { '/wp/v2/posts': { endpoints: [{ methods: ['GET'], args: { yoast_head: {}, yoast_head_json: {} } }, { methods: ['POST'], args: { title: {}, content: {}, meta: { properties: { footnotes: {} } } } }] } } };
    expect(discoverWritableYoastFields(root)).toEqual({ titleField: undefined, descriptionField: undefined });
  });

  it('maps Yoast metadata only when both registered write fields are advertised', () => {
    const root = { routes: { '/wp/v2/posts': { endpoints: [{ methods: ['POST'], args: { meta: { properties: { _yoast_wpseo_title: {}, _yoast_wpseo_metadesc: {} } } } }] } } };
    expect(discoverWritableYoastFields(root)).toEqual({ titleField: '_yoast_wpseo_title', descriptionField: '_yoast_wpseo_metadesc' });
  });
});
