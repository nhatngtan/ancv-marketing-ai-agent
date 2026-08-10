export interface AIProvider {
  splitScenes(masterScript: string): Promise<unknown>;
  generatePlatformCopy(input: { source: string; platform: string }): Promise<string>;
  writeArticle(input: { topic: string; brief?: string }): Promise<string>;
}

export class OpenAIProvider implements AIProvider {
  private requireConfigured(): never {
    throw new Error('OPENAI_API_KEY chưa được cấu hình trong Secret Manager.');
  }
  async splitScenes(_masterScript: string): Promise<unknown> { return this.requireConfigured(); }
  async generatePlatformCopy(_input: { source: string; platform: string }): Promise<string> { return this.requireConfigured(); }
  async writeArticle(_input: { topic: string; brief?: string }): Promise<string> { return this.requireConfigured(); }
}

