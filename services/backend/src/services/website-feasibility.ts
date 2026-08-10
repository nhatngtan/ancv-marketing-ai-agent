import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import type { FeasibilityResult } from './google-feasibility.js';

function isPrivateIp(address: string): boolean {
  if (address === '::1' || address === '::' || address.startsWith('fc') || address.startsWith('fd') || address.startsWith('fe80:')) return true;
  if (isIP(address) !== 4) return false;
  const [a = 0, b = 0] = address.split('.').map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}

async function assertPublicUrl(url: URL) {
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Chỉ chấp nhận URL HTTP/HTTPS công khai, không chứa credential.');
  if (url.hostname === 'localhost' || isIP(url.hostname) && isPrivateIp(url.hostname)) throw new Error('Không cho phép địa chỉ nội bộ.');
  const addresses = await lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some((item) => isPrivateIp(item.address))) throw new Error('Domain phân giải tới địa chỉ nội bộ hoặc không hợp lệ.');
}

async function safeFetch(input: string): Promise<{ response: Response; finalUrl: URL }> {
  let url = new URL(input);
  for (let redirect = 0; redirect < 4; redirect += 1) {
    await assertPublicUrl(url);
    const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(8_000), headers: { 'user-agent': 'ANCV-Feasibility-Test/1.0' } });
    if (response.status < 300 || response.status >= 400) return { response, finalUrl: url };
    const location = response.headers.get('location');
    if (!location) return { response, finalUrl: url };
    url = new URL(location, url);
  }
  throw new Error('Website chuyển hướng quá nhiều lần.');
}

export async function testWebsite(rawUrl: string): Promise<FeasibilityResult> {
  try {
    const homepage = await safeFetch(rawUrl);
    const body = (await homepage.response.text()).slice(0, 1_000_000);
    const generator = body.match(/<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)/i)?.[1] ?? '';
    const wordpressHint = /wordpress|wp-content|wp-includes/i.test(`${generator} ${body} ${homepage.response.headers.get('link') ?? ''}`);
    let apiRootPassed = false;
    if (wordpressHint) {
      const endpoint = new URL('/wp-json/', homepage.finalUrl).toString();
      const api = await safeFetch(endpoint);
      apiRootPassed = api.response.ok && (api.response.headers.get('content-type') ?? '').includes('json');
    }
    return {
      platform: 'website', status: apiRootPassed ? 'partially_available' : 'manual_only', authenticationStatus: 'not_tested',
      publishingCapability: apiRootPassed ? 'partial' : 'unverified', analyticsCapability: 'unverified', scopes: [],
      quotaNotes: 'Quota phụ thuộc CMS/hosting; chưa có credential nên chưa test create/update/upload.', reviewStatus: 'not_tested',
      recommendedMode: apiRootPassed ? 'semi_automatic' : 'manual',
      limitations: apiRootPassed ? ['Phát hiện WordPress REST API công khai; chưa test authentication, create/update article hoặc upload media.'] : ['Không xác minh được API CMS có thể publishing; dùng Manual Fallback.'],
      evidence: { homepageRequest: 'passed', httpStatus: homepage.response.status, finalOrigin: homepage.finalUrl.origin, detectedGenerator: generator || null, wordpressHint, wordpressApiRootRequest: apiRootPassed ? 'passed' : wordpressHint ? 'failed' : 'not_applicable' },
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      platform: 'website', status: 'error', authenticationStatus: 'error', publishingCapability: 'unverified', analyticsCapability: 'unverified', scopes: [], quotaNotes: 'Chưa xác minh.', reviewStatus: 'not_tested', recommendedMode: 'manual',
      limitations: [`Website feasibility request thất bại: ${detail.slice(0, 300)}`], evidence: { homepageRequest: 'failed', error: detail.slice(0, 300) },
    };
  }
}
