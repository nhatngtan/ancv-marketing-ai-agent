import { describe, expect, it } from 'vitest';
import { testWebsite } from '../src/services/website-feasibility.js';

describe('website feasibility safe fetch', () => {
  it('blocks loopback targets instead of performing SSRF', async () => {
    const result = await testWebsite('http://127.0.0.1:8080/private');
    expect(result).toMatchObject({ status: 'error', recommendedMode: 'manual' });
    expect(result.limitations[0]).toContain('địa chỉ nội bộ');
  });
});
