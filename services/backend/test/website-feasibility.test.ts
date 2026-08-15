import { describe, expect, it, vi } from 'vitest';
import { testWebsite } from '../src/services/website-feasibility.js';

describe('website feasibility safe fetch', () => {
  it('blocks loopback targets instead of performing SSRF', async () => {
    const result = await testWebsite('http://127.0.0.1:8080/private');
    expect(result).toMatchObject({ status: 'error', recommendedMode: 'manual' });
    expect(result.limitations[0]).toContain('địa chỉ nội bộ');
  });

  it('uses GET only and reports authenticated read without testing write capabilities', async () => {
    const requestMethods: string[] = [];
    const mockFetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      requestMethods.push(init?.method ?? 'GET');
      const url = String(input);
      if (url.endsWith('/wp-json/')) {
        return new Response(JSON.stringify({
          authentication: { 'application-passwords': { endpoints: {} } },
          routes: {
            '/wp/v2/posts': { endpoints: [{ methods: ['GET', 'POST'] }] },
            '/wp/v2/media': { endpoints: [{ methods: ['GET', 'POST'] }] },
          },
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url.includes('/wp-json/wp/v2/users/me')) {
        expect(new Headers(init?.headers).get('authorization')).toMatch(/^Basic /);
        return new Response(JSON.stringify({ id: 7, slug: 'editor01', roles: ['editor'], capabilities: { edit_posts: true, upload_files: true, publish_posts: true } }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url.includes('/wp-json/wp/v2/posts?')) {
        expect(new Headers(init?.headers).get('authorization')).toMatch(/^Basic /);
        return new Response(JSON.stringify([{ id: 9, status: 'draft', yoast_head_json: {} }]), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response('<html><meta name="generator" content="WordPress 6.8"></html>', { status: 200, headers: { 'content-type': 'text/html' } });
    });

    const result = await testWebsite('https://anninhcanhve.com', {
      username: 'editor01', applicationPassword: 'test-only-application-password',
    }, {
      fetch: mockFetch as typeof fetch,
      lookup: vi.fn(async () => [{ address: '8.8.8.8', family: 4 }]) as never,
    });

    expect(requestMethods).toEqual(['GET', 'GET', 'GET', 'GET']);
    expect(result).toMatchObject({
      status: 'partially_available', authenticationStatus: 'available', publishingCapability: 'unverified', recommendedMode: 'semi_automatic',
      evidence: { publicReadAccess: 'passed', usersMeRequest: 'passed', readAccess: 'passed', createPostsCapability: true, draftCapability: true, mediaUploadCapability: true, seoMetadataRestSupport: true, writeAccess: 'not_tested', mediaUpload: 'not_tested', publishing: 'not_tested' },
    });
  });
});
