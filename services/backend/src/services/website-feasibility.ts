import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import type { FeasibilityResult } from './google-feasibility.js';

export interface WordPressReadOnlyCredential {
  username: string;
  applicationPassword: string;
}

interface WebsiteFeasibilityDependencies {
  fetch: typeof fetch;
  lookup: typeof lookup;
}

const defaultDependencies: WebsiteFeasibilityDependencies = { fetch, lookup };

function isPrivateIp(address: string): boolean {
  if (address === '::1' || address === '::' || address.startsWith('fc') || address.startsWith('fd') || address.startsWith('fe80:')) return true;
  if (isIP(address) !== 4) return false;
  const [a = 0, b = 0] = address.split('.').map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}

async function assertPublicUrl(url: URL, resolve: typeof lookup) {
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Chỉ chấp nhận URL HTTP/HTTPS công khai, không chứa credential.');
  if (url.hostname === 'localhost' || isIP(url.hostname) && isPrivateIp(url.hostname)) throw new Error('Không cho phép địa chỉ nội bộ.');
  const addresses = await resolve(url.hostname, { all: true });
  if (!addresses.length || addresses.some((item) => isPrivateIp(item.address))) throw new Error('Domain phân giải tới địa chỉ nội bộ hoặc không hợp lệ.');
}

async function safeFetch(
  input: string,
  dependencies: WebsiteFeasibilityDependencies,
  authorization?: { origin: string; value: string },
): Promise<{ response: Response; finalUrl: URL }> {
  let url = new URL(input);
  for (let redirect = 0; redirect < 4; redirect += 1) {
    await assertPublicUrl(url, dependencies.lookup);
    const headers: Record<string, string> = { 'user-agent': 'ANCV-Feasibility-Test/1.0' };
    if (authorization && url.origin === authorization.origin) headers.authorization = authorization.value;
    const response = await dependencies.fetch(url, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(8_000), headers });
    if (response.status < 300 || response.status >= 400) return { response, finalUrl: url };
    const location = response.headers.get('location');
    if (!location) return { response, finalUrl: url };
    url = new URL(location, url);
  }
  throw new Error('Website chuyển hướng quá nhiều lần.');
}

export async function testWebsite(
  rawUrl: string,
  credential?: WordPressReadOnlyCredential,
  dependencies: WebsiteFeasibilityDependencies = defaultDependencies,
): Promise<FeasibilityResult> {
  try {
    const homepage = await safeFetch(rawUrl, dependencies);
    const body = (await homepage.response.text()).slice(0, 1_000_000);
    const generator = body.match(/<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)/i)?.[1] ?? '';
    const wordpressHint = /wordpress|wp-content|wp-includes/i.test(`${generator} ${body} ${homepage.response.headers.get('link') ?? ''}`);
    let apiRootPassed = false;
    let applicationPasswordsAdvertised = false;
    let postsCreateAdvertised = false;
    let mediaCreateAdvertised = false;
    let authenticatedReadPassed = false;
    let authenticatedReadStatus: number | 'not_tested' = 'not_tested';
    let authenticatedUser: { id?: number; slug?: string; roles?: string[] } | null = null;
    if (wordpressHint) {
      const endpoint = new URL('/wp-json/', homepage.finalUrl).toString();
      const api = await safeFetch(endpoint, dependencies);
      apiRootPassed = api.response.ok && (api.response.headers.get('content-type') ?? '').includes('json');
      if (apiRootPassed) {
        const discovery = JSON.parse(await api.response.text()) as {
          authentication?: Record<string, unknown>;
          routes?: Record<string, { endpoints?: Array<{ methods?: string[] }> }>;
        };
        const supportsPost = (path: string) => discovery.routes?.[path]?.endpoints?.some((item) => item.methods?.includes('POST')) ?? false;
        applicationPasswordsAdvertised = Boolean(discovery.authentication?.['application-passwords']);
        postsCreateAdvertised = supportsPost('/wp/v2/posts');
        mediaCreateAdvertised = supportsPost('/wp/v2/media');
      }
      if (apiRootPassed && credential?.username && credential.applicationPassword) {
        const authorization = `Basic ${Buffer.from(`${credential.username}:${credential.applicationPassword}`).toString('base64')}`;
        const usersMeUrl = new URL('/wp-json/wp/v2/users/me?context=edit', homepage.finalUrl).toString();
        const usersMe = await safeFetch(usersMeUrl, dependencies, { origin: homepage.finalUrl.origin, value: authorization });
        authenticatedReadStatus = usersMe.response.status;
        authenticatedReadPassed = usersMe.response.ok;
        if (authenticatedReadPassed) {
          const data = await usersMe.response.json() as { id?: number; slug?: string; roles?: string[] };
          authenticatedUser = { id: data.id, slug: data.slug, roles: data.roles };
        }
      }
    }
    const credentialConfigured = Boolean(credential?.username && credential.applicationPassword);
    const authenticationStatus = authenticatedReadPassed ? 'available' : credentialConfigured ? 'error' : 'not_tested';
    const limitations = !apiRootPassed
      ? ['Không xác minh được WordPress REST API; tiếp tục Manual Fallback.']
      : authenticatedReadPassed
        ? ['Authenticated read API PASS. Write API, media upload và publishing chủ ý chưa được kiểm tra vì Website đang xây dựng.']
        : credentialConfigured
          ? [`WordPress REST API công khai PASS nhưng /users/me chưa xác thực thành công (HTTP ${authenticatedReadStatus}). Không chạy bất kỳ write request nào.`]
          : ['WordPress REST API công khai PASS; chưa có đủ secret version để test authenticated GET /users/me. Write API, media và publishing đều NOT TESTED.'];
    return {
      platform: 'website', status: apiRootPassed ? 'partially_available' : 'manual_only', authenticationStatus,
      publishingCapability: 'unverified', analyticsCapability: 'unverified', scopes: [],
      quotaNotes: 'Connectivity check chỉ dùng GET read-only. Quota/limit của write API chưa được kiểm tra.', reviewStatus: 'not_tested',
      recommendedMode: apiRootPassed ? 'semi_automatic' : 'manual',
      limitations,
      evidence: {
        homepageRequest: 'passed', httpStatus: homepage.response.status, finalOrigin: homepage.finalUrl.origin,
        detectedGenerator: generator || null, wordpressHint,
        wordpressApiRootRequest: apiRootPassed ? 'passed' : wordpressHint ? 'failed' : 'not_applicable',
        applicationPasswordsAdvertised, postsCreateAdvertised, mediaCreateAdvertised,
        credentialConfigured,
        usersMeRequest: authenticatedReadPassed ? 'passed' : credentialConfigured ? 'failed' : 'not_tested',
        usersMeHttpStatus: authenticatedReadStatus,
        authenticatedUser,
        publicReadAccess: apiRootPassed ? 'passed' : 'failed',
        readAccess: authenticatedReadPassed ? 'passed' : 'not_tested',
        writeAccess: 'not_tested',
        mediaUpload: 'not_tested',
        publishing: 'not_tested',
      },
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      platform: 'website', status: 'error', authenticationStatus: 'error', publishingCapability: 'unverified', analyticsCapability: 'unverified', scopes: [], quotaNotes: 'Chưa xác minh.', reviewStatus: 'not_tested', recommendedMode: 'manual',
      limitations: [`Website feasibility request thất bại: ${detail.slice(0, 300)}`], evidence: { homepageRequest: 'failed', error: detail.slice(0, 300) },
    };
  }
}
