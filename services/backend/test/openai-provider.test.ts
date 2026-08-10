import { describe, expect, it } from 'vitest';
import { OPENAI_MAX_RETRIES, OpenAIConfigurationError, OpenAIProvider, scenesResponseSchema } from '../src/services/openai-provider.js';

const profile = { companyName:'', brandName:'', website:'', introduction:'', services:'', serviceAreas:'', contact:'', toneOfVoice:'', defaultCta:'', approvedFacts:'' };

describe('OpenAI provider', () => {
  it('degrades to configuration_required without a key and never fabricates output', async () => {
    const provider = new OpenAIProvider();
    expect(provider.getHealth().status).toBe('configuration_required');
    await expect(provider.writeArticle({ topic: 'Test', profile })).rejects.toBeInstanceOf(OpenAIConfigurationError);
    await expect(provider.smokeTest(false)).rejects.toBeInstanceOf(OpenAIConfigurationError);
  });
  it('rejects malformed structured scene output before persistence', () => {
    expect(() => scenesResponseSchema.parse({ scenes: [{ sceneNumber: 1, title: 'Thiếu dữ liệu' }] })).toThrow();
  });
  it('accepts a complete structured scene', () => {
    expect(scenesResponseSchema.parse({ scenes: [{ sceneNumber:1,title:'Mở đầu',durationEstimate:5,narration:'Lời dẫn',visualDescription:'Cổng doanh nghiệp',cameraDirection:'Wide shot',environment:'Ban ngày',characters:[],continuityNotes:'Giữ ánh sáng',generationPrompt:'Cinematic wide shot',status:'draft' }] }).scenes).toHaveLength(1);
  });
  it('limits SDK retries to protect cost', () => expect(OPENAI_MAX_RETRIES).toBe(1));
  it('can initialize with a configured key without startup ordering errors', () => {
    process.env.OPENAI_API_KEY = 'test-key-not-used';
    expect(() => new OpenAIProvider()).not.toThrow();
    delete process.env.OPENAI_API_KEY;
  });
});
