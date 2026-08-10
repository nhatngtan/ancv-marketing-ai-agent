import { GoogleAuth } from 'google-auth-library';
import type { Capability, ConnectorMode, ConnectorStatus, Platform } from '@ancv/shared';
import { config } from '../config.js';

export interface FeasibilityResult {
  platform: Platform;
  status: ConnectorStatus;
  authenticationStatus: ConnectorStatus;
  publishingCapability: Capability;
  analyticsCapability: Capability;
  scopes: string[];
  quotaNotes: string;
  reviewStatus: ConnectorStatus;
  limitations: string[];
  recommendedMode: ConnectorMode;
  evidence: Record<string, unknown>;
}

function errorDetail(error: unknown): string {
  const candidate = error as { response?: { status?: number; data?: { error?: { status?: string; message?: string } } }; code?: number; message?: string };
  const status = candidate.response?.status ?? candidate.code ?? 'unknown';
  const reason = candidate.response?.data?.error?.status ?? candidate.message ?? 'Google API request failed';
  return `HTTP ${status}: ${String(reason).slice(0, 300)}`;
}

export async function testGA4(): Promise<FeasibilityResult> {
  const scopes = ['https://www.googleapis.com/auth/analytics.readonly'];
  try {
    const client = await new GoogleAuth({ scopes }).getClient();
    const summary = await client.request<{ accountSummaries?: Array<{ displayName?: string; propertySummaries?: Array<{ property?: string; displayName?: string }> }> }>({
      url: 'https://analyticsadmin.googleapis.com/v1alpha/accountSummaries?pageSize=200',
    });
    const properties = (summary.data.accountSummaries ?? []).flatMap((account) => account.propertySummaries ?? []);
    if (!config.ga4PropertyId) {
      return {
        platform: 'ga4', status: properties.length ? 'partially_available' : 'not_tested', authenticationStatus: 'available',
        publishingCapability: 'unavailable', analyticsCapability: 'unverified', scopes,
        quotaNotes: 'Data API dùng quota token theo property/hour; request production phải bật returnPropertyQuota.',
        reviewStatus: 'not_tested', recommendedMode: properties.length ? 'semi_automatic' : 'manual',
        limitations: [properties.length ? 'Đã xác thực và liệt kê được property, nhưng chưa chọn GA4_PROPERTY_ID của ANCV.' : 'Service Account chưa được cấp quyền trên GA4 property của ANCV.'],
        evidence: { accountSummaryRequest: 'passed', accessiblePropertyCount: properties.length, propertySelection: 'missing' },
      };
    }
    const selected = config.ga4PropertyId.replace(/^properties\//, '');
    const report = await client.request<{ rows?: unknown[]; propertyQuota?: unknown }>({
      url: `https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(selected)}:runReport`, method: 'POST',
      data: { dateRanges: [{ startDate: '7daysAgo', endDate: 'yesterday' }], dimensions: [{ name: 'date' }], metrics: [{ name: 'activeUsers' }], limit: 10, returnPropertyQuota: true },
    });
    return {
      platform: 'ga4', status: 'available', authenticationStatus: 'available', publishingCapability: 'unavailable', analyticsCapability: 'verified', scopes,
      quotaNotes: 'Đã bật returnPropertyQuota trong request test; cần tiếp tục giám sát token/property/hour.', reviewStatus: 'available', recommendedMode: 'automatic', limitations: [],
      evidence: { accountSummaryRequest: 'passed', runReportRequest: 'passed', propertyId: selected, returnedRows: report.data.rows?.length ?? 0, quotaReturned: Boolean(report.data.propertyQuota) },
    };
  } catch (error) {
    return {
      platform: 'ga4', status: 'not_tested', authenticationStatus: 'error', publishingCapability: 'unavailable', analyticsCapability: 'unverified', scopes,
      quotaNotes: 'Chưa đo được quota bằng request nghiệp vụ thành công.', reviewStatus: 'not_tested', recommendedMode: 'manual',
      limitations: [`Request thực tế chưa PASS: ${errorDetail(error)}`], evidence: { request: 'failed', error: errorDetail(error) },
    };
  }
}

export async function testSearchConsole(): Promise<FeasibilityResult> {
  const scopes = ['https://www.googleapis.com/auth/webmasters.readonly'];
  try {
    const client = await new GoogleAuth({ scopes }).getClient();
    const sites = await client.request<{ siteEntry?: Array<{ siteUrl: string; permissionLevel?: string }> }>({ url: 'https://www.googleapis.com/webmasters/v3/sites' });
    const entries = sites.data.siteEntry ?? [];
    if (!config.searchConsoleSiteUrl) {
      return {
        platform: 'search_console', status: entries.length ? 'partially_available' : 'not_tested', authenticationStatus: 'available', publishingCapability: 'unavailable', analyticsCapability: 'unverified', scopes,
        quotaNotes: 'Search Analytics: 1.200 QPM/site và user; 40.000 QPM và 30.000.000 QPD/project theo tài liệu hiện hành.', reviewStatus: 'not_tested',
        recommendedMode: entries.length ? 'semi_automatic' : 'manual', limitations: [entries.length ? 'Đã liệt kê property nhưng chưa chọn SEARCH_CONSOLE_SITE_URL của ANCV.' : 'Service Account chưa được cấp quyền trên Search Console property của ANCV.'],
        evidence: { sitesListRequest: 'passed', accessibleSiteCount: entries.length, siteSelection: 'missing' },
      };
    }
    const end = new Date(); end.setUTCDate(end.getUTCDate() - 2);
    const start = new Date(end); start.setUTCDate(start.getUTCDate() - 6);
    const query = await client.request<{ rows?: unknown[] }>({
      url: `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(config.searchConsoleSiteUrl)}/searchAnalytics/query`, method: 'POST',
      data: { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10), dimensions: ['date'], rowLimit: 10, dataState: 'final' },
    });
    return {
      platform: 'search_console', status: 'available', authenticationStatus: 'available', publishingCapability: 'unavailable', analyticsCapability: 'verified', scopes,
      quotaNotes: 'Request test dùng 7 ngày, nhóm theo date và rowLimit 10 để giảm load quota.', reviewStatus: 'available', recommendedMode: 'automatic', limitations: [],
      evidence: { sitesListRequest: 'passed', queryRequest: 'passed', siteUrl: config.searchConsoleSiteUrl, returnedRows: query.data.rows?.length ?? 0 },
    };
  } catch (error) {
    return {
      platform: 'search_console', status: 'not_tested', authenticationStatus: 'error', publishingCapability: 'unavailable', analyticsCapability: 'unverified', scopes,
      quotaNotes: 'Chưa đo được quota bằng request nghiệp vụ thành công.', reviewStatus: 'not_tested', recommendedMode: 'manual',
      limitations: [`Request thực tế chưa PASS: ${errorDetail(error)}`], evidence: { request: 'failed', error: errorDetail(error) },
    };
  }
}
