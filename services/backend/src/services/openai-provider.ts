import OpenAI from 'openai';
import { config } from '../config.js';

export interface SceneDraft {
  order: number;
  narration: string;
  visualPrompt: string;
  durationSeconds: number;
}

export interface AIProvider {
  splitScenes(masterScript: string): Promise<SceneDraft[]>;
  generatePlatformCopy(input: { source: string; platform: string }): Promise<string>;
  writeArticle(input: { topic: string; brief?: string }): Promise<string>;
  generateImage(prompt: string): Promise<{ base64: string; mimeType: 'image/png' }>;
  smokeTest(includeImage: boolean): Promise<OpenAISmokeEvidence>;
  getHealth(): { status: 'operational' | 'configuration_required'; textModel: string; imageModel: string };
}

export interface OpenAISmokeEvidence {
  checkedAt: string;
  text: {
    status: 'passed'; model: string; requestId: string | null; outputMatched: true;
    inputTokens: number | null; outputTokens: number | null; totalTokens: number | null;
  };
  image: {
    status: 'passed' | 'not_requested'; model: string; requestId: string | null;
    size: '1024x1024'; quality: 'low'; bytes: number | null;
    inputTokens: number | null; outputTokens: number | null; totalTokens: number | null;
  };
}

export class OpenAIConfigurationError extends Error {
  constructor() { super('OPENAI_API_KEY chưa được cấu hình trong Secret Manager.'); this.name = 'OpenAIConfigurationError'; }
}

export class OpenAIProvider implements AIProvider {
  private readonly apiKey = process.env.OPENAI_API_KEY?.trim() ?? '';
  private readonly client = this.apiKey ? new OpenAI({ apiKey: this.apiKey, timeout: 60_000, maxRetries: 2 }) : null;

  getHealth() {
    return {
      status: this.client ? 'operational' as const : 'configuration_required' as const,
      textModel: config.openAITextModel,
      imageModel: config.openAIImageModel,
    };
  }

  async splitScenes(masterScript: string): Promise<SceneDraft[]> {
    const client = this.requireClient();
    const response = await client.responses.create({
      model: config.openAITextModel,
      instructions: 'Bạn chia MASTER SCRIPT có sẵn thành scene. Không sáng tác hoặc thay thế MASTER SCRIPT. Giữ nguyên ý nghĩa, viết visual prompt an toàn cho Google Flow.',
      input: masterScript,
      max_output_tokens: 4_000,
      text: {
        format: {
          type: 'json_schema', name: 'ancv_scenes', strict: true,
          schema: {
            type: 'object', additionalProperties: false, required: ['scenes'],
            properties: {
              scenes: {
                type: 'array', minItems: 1,
                items: {
                  type: 'object', additionalProperties: false,
                  required: ['order', 'narration', 'visualPrompt', 'durationSeconds'],
                  properties: {
                    order: { type: 'integer', minimum: 1 }, narration: { type: 'string' },
                    visualPrompt: { type: 'string' }, durationSeconds: { type: 'integer', minimum: 1, maximum: 60 },
                  },
                },
              },
            },
          },
        },
      },
    });
    const parsed = JSON.parse(response.output_text) as { scenes: SceneDraft[] };
    return parsed.scenes;
  }

  async generatePlatformCopy(input: { source: string; platform: string }): Promise<string> {
    const client = this.requireClient();
    const response = await client.responses.create({
      model: config.openAITextModel,
      instructions: `Điều chỉnh nội dung Marketing ANCV cho ${input.platform}. Không bịa số liệu. TikTok dùng đúng một câu ngắn; nền tảng khác dùng mô tả đầy đủ.`,
      input: input.source,
      max_output_tokens: 1_500,
      text: { verbosity: 'low' },
    });
    return response.output_text.trim();
  }

  async writeArticle(input: { topic: string; brief?: string }): Promise<string> {
    const client = this.requireClient();
    const response = await client.responses.create({
      model: config.openAITextModel,
      instructions: 'Viết bài Marketing tiếng Việt cho ANCV theo chủ đề và brief được cung cấp. Không bịa KPI, chứng nhận hoặc dữ liệu thực tế.',
      input: `Chủ đề: ${input.topic}\nBrief: ${input.brief ?? 'Không có'}`,
      max_output_tokens: 5_000,
      text: { verbosity: 'medium' },
    });
    return response.output_text.trim();
  }

  async generateImage(prompt: string): Promise<{ base64: string; mimeType: 'image/png' }> {
    const client = this.requireClient();
    const response = await client.images.generate({ model: config.openAIImageModel, prompt, size: '1536x1024', output_format: 'png' });
    const base64 = response.data?.[0]?.b64_json;
    if (!base64) throw new Error('OPENAI_IMAGE_EMPTY');
    return { base64, mimeType: 'image/png' };
  }

  async smokeTest(includeImage: boolean): Promise<OpenAISmokeEvidence> {
    const client = this.requireClient();
    const textResponse = await client.responses.create({
      model: config.openAITextModel,
      instructions: 'Return exactly ANCV_OK and nothing else.',
      input: 'Health check',
      max_output_tokens: 16,
      reasoning: { effort: 'none' },
      store: false,
      text: { verbosity: 'low' },
    });
    if (textResponse.output_text.trim() !== 'ANCV_OK') throw new Error('OPENAI_SMOKE_OUTPUT_MISMATCH');
    const textUsage = textResponse.usage;
    const evidence: OpenAISmokeEvidence = {
      checkedAt: new Date().toISOString(),
      text: {
        status: 'passed', model: textResponse.model, requestId: textResponse._request_id ?? null, outputMatched: true,
        inputTokens: textUsage?.input_tokens ?? null, outputTokens: textUsage?.output_tokens ?? null, totalTokens: textUsage?.total_tokens ?? null,
      },
      image: {
        status: 'not_requested', model: config.openAIImageModel, requestId: null,
        size: '1024x1024', quality: 'low', bytes: null, inputTokens: null, outputTokens: null, totalTokens: null,
      },
    };
    if (!includeImage) return evidence;
    const imageResponse = await client.images.generate({
      model: config.openAIImageModel,
      prompt: 'A minimal flat green shield icon on a plain white background, no text.',
      size: '1024x1024', quality: 'low', output_format: 'png', n: 1,
    });
    const encoded = imageResponse.data?.[0]?.b64_json;
    if (!encoded) throw new Error('OPENAI_IMAGE_EMPTY');
    evidence.image = {
      status: 'passed', model: config.openAIImageModel,
      requestId: (imageResponse as typeof imageResponse & { _request_id?: string | null })._request_id ?? null,
      size: '1024x1024', quality: 'low', bytes: Buffer.from(encoded, 'base64').byteLength,
      inputTokens: imageResponse.usage?.input_tokens ?? null,
      outputTokens: imageResponse.usage?.output_tokens ?? null,
      totalTokens: imageResponse.usage?.total_tokens ?? null,
    };
    return evidence;
  }

  private requireClient(): OpenAI {
    if (!this.client) throw new OpenAIConfigurationError();
    return this.client;
  }
}

export const openAIProvider = new OpenAIProvider();
