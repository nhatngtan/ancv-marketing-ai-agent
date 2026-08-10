import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

vi.stubEnv('SKIP_FIRESTORE_HEALTH', 'true');
const { createApp } = await import('../src/app.js');

describe('health endpoints', () => {
  it('keeps core healthy when Firestore is not configured locally', async () => {
    const response = await request(createApp()).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: 'ok', dependencies: { firestore: 'configuration_required', openai: 'configuration_required' } });
  });
  it('reports independent manual connectors without failing', async () => {
    const response = await request(createApp()).get('/connectors/health');
    expect(response.status).toBe(200);
    expect(response.body.connectors).toHaveLength(8);
    expect(response.body.connectors[0]).toMatchObject({ mode: 'manual' });
  });
});
