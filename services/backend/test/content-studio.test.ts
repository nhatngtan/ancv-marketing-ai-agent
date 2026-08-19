import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildAIJobId } from '../src/services/ai-job.js';
import { createApp } from '../src/app.js';
import { contentProjectFolder, isOfficialFlowProjectUrl } from '../src/modules/flow-service.js';

describe('AI Content Studio cost and security controls', () => {
  it('builds the same job id for duplicate clicks', () => {
    expect(buildAIJobId('user-1','image_generation','request-1')).toBe(buildAIJobId('user-1','image_generation','request-1'));
  });
  it('separates jobs by operation and user', () => {
    expect(buildAIJobId('user-1','image_generation','request-1')).not.toBe(buildAIJobId('user-1','article_generation','request-1'));
    expect(buildAIJobId('user-1','image_generation','request-1')).not.toBe(buildAIJobId('user-2','image_generation','request-1'));
  });
  it.each([
    ['/v1/ai/content/content-1/scenes/breakdown',{idempotencyKey:'request-123'}],
    ['/v1/ai/content/content-1/article',{idempotencyKey:'request-123'}],
    ['/v1/ai/content/content-1/images',{idempotencyKey:'request-123',prompt:'A safe test image prompt'}],
    ['/v1/ai/content/content-1/platform-copy/facebook',{idempotencyKey:'request-123'}],
  ])('requires authentication for %s', async (path, body) => {
    const response = await request(createApp()).post(path).send(body);
    expect(response.status).toBe(401);
    expect(response.body.error).toBe('AUTH_REQUIRED');
  });
  it('rejects malformed company profile updates before any write', async () => {
    const response = await request(createApp()).put('/v1/content/company-profile').send({ companyName: 'x' });
    expect(response.status).toBe(401);
  });
  it('requires authentication before creating a Flow job', async () => {
    const response = await request(createApp()).post('/v1/flow/jobs').send({ contentDocId: 'content-1', sceneId: 'scene-1', flowAccountId: 'account-01' });
    expect(response.status).toBe(401);
    expect(response.body.error).toBe('AUTH_REQUIRED');
  });
  it.each([
    ['get', '/v1/flow/browser-profiles'],
    ['post', '/v1/flow/browser-profiles/scan'],
    ['put', '/v1/flow/browser-profiles/mappings'],
    ['post', '/v1/flow/browser-profiles/test'],
  ] as const)('protects Chrome profile Admin endpoint %s %s', async (method, path) => {
    const response = await request(createApp())[method](path).send({});
    expect(response.status).toBe(401);
    expect(response.body.error).toBe('AUTH_REQUIRED');
  });
  it('accepts only official localized Google Flow project URLs', () => {
    expect(isOfficialFlowProjectUrl('https://labs.google/fx/vi/tools/flow/project/project-1')).toBe(true);
    expect(isOfficialFlowProjectUrl('https://labs.google/fx/tools/flow/project/project-1')).toBe(true);
    expect(isOfficialFlowProjectUrl('https://example.com/fx/vi/tools/flow/project/project-1')).toBe(false);
    expect(isOfficialFlowProjectUrl('https://labs.google/fx/vi/tools/flow')).toBe(false);
  });
  it('builds safe project folders for Video and Article Content', () => {
    expect(contentProjectFolder({ type: 'video', contentId: 'ANCV-VID-2026-001' })).toBe('Projects/ANCV-VID-2026-001');
    expect(contentProjectFolder({ type: 'article', contentId: 'ANCV-ART-2026-001' })).toBe('Projects/ANCV-ART-2026-001');
    expect(() => contentProjectFolder({ type: 'article', contentId: 'ANCV-VID-2026-001' })).toThrow('LOCAL_FOLDER_METADATA_INVALID');
  });
  it.each([
    ['get', '/v1/content/content-management-settings'],
    ['put', '/v1/content/content-management-settings'],
    ['post', '/v1/flow/local-commands/open-content-folder'],
  ] as const)('protects Content Management endpoint %s %s', async (method, path) => {
    const response = await request(createApp())[method](path).send({});
    expect(response.status).toBe(401);
    expect(response.body.error).toBe('AUTH_REQUIRED');
  });
});
