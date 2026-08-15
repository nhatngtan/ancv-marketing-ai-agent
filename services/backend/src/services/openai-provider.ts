import OpenAI from 'openai';
import { z } from 'zod';
import type { CompanyProfile, Platform, SceneRecord, VisualStyle, CharacterReference, AIUsageTokens, ArticleSeoData } from '@ancv/shared';
import { aiModelConfig, config } from '../config.js';

export const sceneDraftSchema = z.object({
  sceneNumber: z.number().int().min(1),
  title: z.string().min(1).max(200),
  durationEstimate: z.number().int().min(1).max(120),
  narration: z.string().max(10_000),
  visualDescription: z.string().min(1).max(5_000),
  cameraDirection: z.string().max(2_000),
  environment: z.string().max(2_000),
  characters: z.array(z.string().max(200)).max(20),
  continuityNotes: z.string().max(3_000),
  generationPrompt: z.string().min(1).max(8_000),
  status: z.literal('draft'),
}).strict();
export const scenesResponseSchema = z.object({ scenes: z.array(sceneDraftSchema).min(1).max(120) }).strict();
const copyResponseSchema = z.object({ title: z.string().max(300), text: z.string().min(1).max(30_000) }).strict();
export const articleResponseSchema = z.object({
  seoTitle: z.string().min(20).max(90),
  h1: z.string().min(10).max(180),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120),
  metaDescription: z.string().min(70).max(220),
  focusKeyword: z.string().min(2).max(120),
  body: z.string().min(800).max(80_000),
  suggestedInternalLinks: z.array(z.string().max(500)).max(10),
  faq: z.array(z.object({ question: z.string().min(5).max(300), answer: z.string().min(10).max(2_000) }).strict()).max(10),
  imageAltTextSuggestions: z.array(z.string().min(5).max(300)).min(1).max(10),
}).strict();
const promptResponseSchema = z.object({ generationPrompt: z.string().min(1).max(8_000) }).strict();

export function validatePlatformCopy(platform: Platform, value: { title: string; text: string }): { title: string; text: string } {
  const parsed = copyResponseSchema.parse(value);
  if (platform === 'tiktok' && parsed.text.split(/[.!?]+/).filter(Boolean).length > 1) throw new Error('OPENAI_TIKTOK_ONE_SENTENCE_REQUIRED');
  return parsed;
}

export type SceneDraft = z.infer<typeof sceneDraftSchema>;
export interface AIResult<T> { data: T; model: string; requestId: string | null; usage: AIUsageTokens }
export type OpenAIImageResult = AIResult<{ base64: string; mimeType: 'image/png'; size: ImageSize; quality: ImageQuality }>;
export type ImageSize = '1024x1024' | '1024x1536' | '1536x1024';
export type ImageQuality = 'low' | 'medium' | 'high';
export const OPENAI_MAX_RETRIES = 1;

export interface OpenAISmokeEvidence {
  checkedAt: string;
  text: { status: 'passed'; model: string; requestId: string | null; outputMatched: true; inputTokens: number | null; outputTokens: number | null; totalTokens: number | null };
  image: { status: 'passed' | 'not_requested'; model: string; requestId: string | null; size: '1024x1024'; quality: 'low'; bytes: number | null; inputTokens: number | null; outputTokens: number | null; totalTokens: number | null };
}

export class OpenAIConfigurationError extends Error {
  constructor() { super('OPENAI_API_KEY chưa được cấu hình trong Secret Manager.'); this.name = 'OpenAIConfigurationError'; }
}

function usageOf(response: { usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number } | null }): AIUsageTokens {
  return { inputTokens: response.usage?.input_tokens ?? null, outputTokens: response.usage?.output_tokens ?? null, totalTokens: response.usage?.total_tokens ?? null };
}

function companyContext(profile: CompanyProfile): string {
  return `THÔNG TIN ĐƯỢC PHÉP SỬ DỤNG (trường trống nghĩa là chưa xác minh):\n${JSON.stringify(profile)}`;
}

function factualSafety(): string {
  return 'Không được bịa năm thành lập, số nhân viên/khách hàng, chứng nhận, giải thưởng, phạm vi, địa điểm, giá, cam kết, số liệu hoặc khách hàng. Chỉ khẳng định dữ kiện có trong input hay Thông tin Công ty; nếu thiếu hãy dùng diễn đạt trung tính.';
}

const sceneJsonSchema = {
  type: 'object', additionalProperties: false, required: ['scenes'], properties: { scenes: { type: 'array', minItems: 1, maxItems: 120, items: {
    type: 'object', additionalProperties: false,
    required: ['sceneNumber','title','durationEstimate','narration','visualDescription','cameraDirection','environment','characters','continuityNotes','generationPrompt','status'],
    properties: {
      sceneNumber: { type: 'integer', minimum: 1 }, title: { type: 'string' }, durationEstimate: { type: 'integer', minimum: 1, maximum: 120 },
      narration: { type: 'string' }, visualDescription: { type: 'string' }, cameraDirection: { type: 'string' }, environment: { type: 'string' },
      characters: { type: 'array', items: { type: 'string' } }, continuityNotes: { type: 'string' }, generationPrompt: { type: 'string' }, status: { type: 'string', enum: ['draft'] },
    },
  } } },
} as const;
const copyJsonSchema = { type: 'object', additionalProperties: false, required: ['title','text'], properties: { title: { type: 'string' }, text: { type: 'string' } } } as const;
const articleJsonSchema = {
  type: 'object', additionalProperties: false,
  required: ['seoTitle','h1','slug','metaDescription','focusKeyword','body','suggestedInternalLinks','faq','imageAltTextSuggestions'],
  properties: {
    seoTitle: { type: 'string' }, h1: { type: 'string' }, slug: { type: 'string' }, metaDescription: { type: 'string' }, focusKeyword: { type: 'string' },
    body: { type: 'string' }, suggestedInternalLinks: { type: 'array', items: { type: 'string' } },
    faq: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['question','answer'], properties: { question: { type: 'string' }, answer: { type: 'string' } } } },
    imageAltTextSuggestions: { type: 'array', items: { type: 'string' } },
  },
} as const;
const promptJsonSchema = { type: 'object', additionalProperties: false, required: ['generationPrompt'], properties: { generationPrompt: { type: 'string' } } } as const;

export class OpenAIProvider {
  private readonly apiKey = process.env.OPENAI_API_KEY?.trim() ?? '';
  private readonly client = this.apiKey ? new OpenAI({ apiKey: this.apiKey, timeout: 75_000, maxRetries: OPENAI_MAX_RETRIES }) : null;

  getHealth() { return { status: this.client ? 'operational' as const : 'configuration_required' as const, textModel: config.openAITextModel, imageModel: config.openAIImageModel }; }

  async splitScenes(input: { masterScript: string; topic: string; profile: CompanyProfile; visualStyle?: VisualStyle; characters?: CharacterReference[] }): Promise<AIResult<SceneDraft[]>> {
    const response = await this.requireClient().responses.create({
      model: aiModelConfig.scene_breakdown,
      instructions: `Bạn là biên tập viên cảnh quay ANCV. Chỉ chia MASTER SCRIPT do người dùng cung cấp; không viết lại MASTER SCRIPT. Tạo prompt Google Flow độc lập nhưng liên tục về nhân vật/bối cảnh/phong cách. ${factualSafety()}`,
      input: `CHỦ ĐỀ: ${input.topic}\nMASTER SCRIPT:\n${input.masterScript}\nVISUAL STYLE:\n${JSON.stringify(input.visualStyle ?? {})}\nCHARACTER REFERENCES:\n${JSON.stringify(input.characters ?? [])}\n${companyContext(input.profile)}`,
      max_output_tokens: 12_000, store: false,
      text: { format: { type: 'json_schema', name: 'ancv_scene_breakdown', strict: true, schema: sceneJsonSchema } },
    });
    const parsed = scenesResponseSchema.parse(JSON.parse(response.output_text));
    return { data: parsed.scenes, model: response.model, requestId: response._request_id ?? null, usage: usageOf(response) };
  }

  async regenerateScene(input: { masterScript: string; topic: string; scene: Partial<SceneRecord>; profile: CompanyProfile; visualStyle?: VisualStyle; characters?: CharacterReference[] }): Promise<AIResult<SceneDraft>> {
    const result = await this.splitScenes({ ...input, masterScript: `Bối cảnh MASTER SCRIPT:\n${input.masterScript}\n\nChỉ tái tạo MỘT scene dựa trên scene hiện tại:\n${JSON.stringify(input.scene)}` });
    const scene = result.data[0];
    if (result.data.length !== 1 || !scene) throw new Error('OPENAI_SCENE_COUNT_INVALID');
    return { ...result, data: { ...scene, sceneNumber: input.scene.sceneNumber ?? scene.sceneNumber } };
  }

  async generateFlowPrompt(input: { masterScript: string; scene: Partial<SceneRecord>; profile: CompanyProfile; visualStyle?: VisualStyle; characters?: CharacterReference[] }): Promise<AIResult<string>> {
    const response = await this.requireClient().responses.create({
      model: aiModelConfig.flow_prompt,
      instructions: `Tạo đúng một prompt Google Flow cho scene. Bám sát narration, continuity, character reference và visual style; không thêm dữ kiện Marketing. ${factualSafety()}`,
      input: `MASTER SCRIPT:\n${input.masterScript}\nSCENE:\n${JSON.stringify(input.scene)}\nVISUAL STYLE:\n${JSON.stringify(input.visualStyle ?? {})}\nCHARACTERS:\n${JSON.stringify(input.characters ?? [])}\n${companyContext(input.profile)}`,
      max_output_tokens: 2_000, store: false,
      text: { format: { type: 'json_schema', name: 'ancv_flow_prompt', strict: true, schema: promptJsonSchema } },
    });
    const parsed = promptResponseSchema.parse(JSON.parse(response.output_text));
    return { data: parsed.generationPrompt, model: response.model, requestId: response._request_id ?? null, usage: usageOf(response) };
  }

  async generatePlatformCopy(input: { source: string; topic: string; platform: Platform; contentType: 'video' | 'article'; profile: CompanyProfile }): Promise<AIResult<{ title: string; text: string }>> {
    const platformRule: Record<string, string> = {
      tiktok: 'Đúng 01 câu mô tả ngắn, không tiêu đề.', youtube: 'Có tiêu đề hấp dẫn nhưng đúng sự thật và mô tả đầy đủ.',
      facebook: 'Content phù hợp Facebook, dễ đọc và có CTA nếu CTA đã được xác minh.', zalo: 'Content đầy đủ, trực tiếp, phù hợp Zalo.',
      linkedin: 'Giọng chuyên nghiệp B2B, không sáo rỗng.', website: 'Bài đầy đủ dùng cho Website; giữ cấu trúc và thông tin gốc.',
    };
    const response = await this.requireClient().responses.create({
      model: input.contentType === 'video' ? aiModelConfig.video_social_copy : aiModelConfig.article_platform_copy,
      instructions: `Tạo phiên bản riêng cho ${input.platform}. ${platformRule[input.platform] ?? ''} Không copy nguyên một caption chung giữa các nền tảng. Giữ cùng thông điệp. ${factualSafety()}`,
      input: `CHỦ ĐỀ: ${input.topic}\nNỘI DUNG NGUỒN:\n${input.source}\n${companyContext(input.profile)}`,
      max_output_tokens: 4_000, store: false,
      text: { format: { type: 'json_schema', name: 'ancv_platform_copy', strict: true, schema: copyJsonSchema } },
    });
    const parsed = validatePlatformCopy(input.platform, JSON.parse(response.output_text));
    return { data: parsed, model: response.model, requestId: response._request_id ?? null, usage: usageOf(response) };
  }

  async writeArticle(input: { topic: string; objective?: string; emphasis?: string; sourceMaterial?: string; notes?: string; desiredLength?: string; focusKeyword?: string; profile: CompanyProfile }): Promise<AIResult<ArticleSeoData & { body: string }>> {
    const response = await this.requireClient().responses.create({
      model: aiModelConfig.article_generation,
      instructions: `Bạn là biên tập viên SEO tiếng Việt của ANCV. Viết Website Article canonical hữu ích, đúng search intent và dễ đọc; dùng Markdown cho body, bắt đầu phần nội dung bằng mở bài và dùng ##/### cho H2/H3 (H1 trả ở field riêng). Focus keyword phải tự nhiên, không stuffing. SEO Title đúng nội dung, không clickbait. Slug lowercase không dấu, chỉ chữ số/chữ Latin và gạch ngang. CTA chỉ dựa trên CTA hoặc thông tin liên hệ đã xác minh. Suggested internal links chỉ nêu URL/đích có trong Company Profile hoặc tài liệu nguồn; nếu không có thì trả mảng rỗng. FAQ chỉ thêm khi phù hợp. Alt text mô tả hình ảnh, không nhồi keyword. Không tự publish. ${factualSafety()}`,
      input: `CHỦ ĐỀ: ${input.topic}\nMỤC TIÊU/YÊU CẦU: ${input.objective ?? ''}\nTỪ KHÓA CHÍNH DO USER NHẬP (trống thì tự chọn đúng 01 focus keyword): ${input.focusKeyword ?? ''}\nNHẤN MẠNH: ${input.emphasis ?? ''}\nTÀI LIỆU NGUỒN: ${input.sourceMaterial ?? ''}\nGHI CHÚ: ${input.notes ?? ''}\nĐỘ DÀI: ${input.desiredLength ?? ''}\n${companyContext(input.profile)}`,
      max_output_tokens: 12_000, store: false,
      text: { format: { type: 'json_schema', name: 'ancv_seo_article', strict: true, schema: articleJsonSchema } },
    });
    const parsed = articleResponseSchema.parse(JSON.parse(response.output_text));
    return { data: parsed, model: response.model, requestId: response._request_id ?? null, usage: usageOf(response) };
  }

  async generateImage(input: { prompt: string; size?: ImageSize; quality?: ImageQuality }): Promise<OpenAIImageResult> {
    const size = input.size ?? '1024x1024'; const quality = input.quality ?? 'low';
    const response = await this.requireClient().images.generate({ model: aiModelConfig.image_generation, prompt: input.prompt, size, quality, output_format: 'png', n: 1 });
    const base64 = response.data?.[0]?.b64_json;
    if (!base64) throw new Error('OPENAI_IMAGE_EMPTY');
    return { data: { base64, mimeType: 'image/png', size, quality }, model: aiModelConfig.image_generation, requestId: (response as typeof response & { _request_id?: string | null })._request_id ?? null, usage: usageOf(response) };
  }

  async smokeTest(includeImage: boolean): Promise<OpenAISmokeEvidence> {
    const client = this.requireClient();
    const textResponse = await client.responses.create({ model: config.openAITextModel, instructions: 'Return exactly ANCV_OK and nothing else.', input: 'Health check', max_output_tokens: 16, reasoning: { effort: 'none' }, store: false, text: { verbosity: 'low' } });
    if (textResponse.output_text.trim() !== 'ANCV_OK') throw new Error('OPENAI_SMOKE_OUTPUT_MISMATCH');
    const evidence: OpenAISmokeEvidence = { checkedAt: new Date().toISOString(), text: { status: 'passed', model: textResponse.model, requestId: textResponse._request_id ?? null, outputMatched: true, ...usageOf(textResponse) }, image: { status: 'not_requested', model: config.openAIImageModel, requestId: null, size: '1024x1024', quality: 'low', bytes: null, inputTokens: null, outputTokens: null, totalTokens: null } };
    if (!includeImage) return evidence;
    const image = await this.generateImage({ prompt: 'A minimal flat green shield icon on a plain white background, no text.', size: '1024x1024', quality: 'low' });
    evidence.image = { status: 'passed', model: image.model, requestId: image.requestId, size: '1024x1024', quality: 'low', bytes: Buffer.from(image.data.base64, 'base64').byteLength, ...image.usage };
    return evidence;
  }

  private requireClient(): OpenAI { if (!this.client) throw new OpenAIConfigurationError(); return this.client; }
}

export const openAIProvider = new OpenAIProvider();
