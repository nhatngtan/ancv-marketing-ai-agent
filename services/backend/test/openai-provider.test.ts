import { describe, expect, it } from 'vitest';
import { OpenAIConfigurationError, OpenAIProvider } from '../src/services/openai-provider.js';

describe('OpenAI provider', () => {
  it('degrades to configuration_required without a key and never fabricates output', async () => {
    const provider = new OpenAIProvider();
    expect(provider.getHealth().status).toBe('configuration_required');
    await expect(provider.writeArticle({ topic: 'Test' })).rejects.toBeInstanceOf(OpenAIConfigurationError);
  });
});
