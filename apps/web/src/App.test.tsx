import { describe, expect, it } from 'vitest';
import { aggregatePublishingStatus, recommendConnectorMode, type PlatformPublication } from '@ancv/shared';

describe('graceful degradation rules', () => {
  it('keeps independent platforms and marks partial publication', () => {
    const jobs: PlatformPublication[] = [
      { platform: 'youtube', mode: 'automatic', status: 'published' },
      { platform: 'facebook', mode: 'automatic', status: 'published' },
      { platform: 'tiktok', mode: 'semi_automatic', status: 'needs_action' },
      { platform: 'zalo', mode: 'manual', status: 'manual_pending' },
    ];
    expect(aggregatePublishingStatus(jobs)).toBe('partially_published');
    expect(jobs[0]?.status).toBe('published');
  });
  it('never recommends automatic for pending review', () => {
    expect(recommendConnectorMode('pending_review')).toBe('semi_automatic');
    expect(recommendConnectorMode('not_tested')).toBe('manual');
    expect(recommendConnectorMode('available')).toBe('automatic');
  });
});

