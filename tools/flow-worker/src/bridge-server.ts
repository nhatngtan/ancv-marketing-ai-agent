import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { LocalAgentConfig } from './config.js';

interface BridgeCommand {
  id: string;
  type: string;
  payload: Record<string, unknown>;
}

interface PendingCommand {
  command: BridgeCommand;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(JSON.stringify(body));
}

async function body(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    length += buffer.length;
    if (length > 64 * 1024) throw new Error('BRIDGE_BODY_TOO_LARGE');
    chunks.push(buffer);
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown> : {};
}

export class BridgeServer {
  private readonly queues = new Map<string, BridgeCommand[]>();
  private readonly pending = new Map<string, PendingCommand>();
  private readonly connected = new Map<string, { bridgeId: string; lastSeen: number }>();
  private readonly setupNonces = new Map<string, { profileId: string; expiresAt: number }>();
  private server: Server | null = null;

  constructor(private readonly config: LocalAgentConfig) {}

  async start(): Promise<void> {
    if (this.server) return;
    this.server = createServer((request, response) => this.handle(request, response).catch(() => json(response, 500, { error: 'BRIDGE_INTERNAL_ERROR' })));
    await new Promise<void>((resolve, reject) => {
      this.server!.once('error', reject);
      this.server!.listen(this.config.bridgePort, this.config.bridgeHost, resolve);
    });
  }

  async close(): Promise<void> {
    if (!this.server) return;
    const server = this.server;
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    this.server = null;
  }

  setupUrl(profileId: string, nextUrl: string): string {
    const nonce = randomUUID();
    this.setupNonces.set(nonce, { profileId, expiresAt: Date.now() + 60_000 });
    const url = new URL(`http://${this.config.bridgeHost}:${this.config.bridgePort}/setup`);
    url.searchParams.set('profileId', profileId);
    url.searchParams.set('nonce', nonce);
    url.searchParams.set('next', nextUrl);
    return url.toString();
  }

  isConnected(profileId: string): boolean {
    const bridge = this.connected.get(profileId);
    return Boolean(bridge && Date.now() - bridge.lastSeen < 10_000);
  }

  async waitForConnection(profileId: string, timeoutMs = 30_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (this.isConnected(profileId)) return;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error('BROWSER_BRIDGE_CONNECTION_TIMEOUT');
  }

  sendCommand(profileId: string, type: string, payload: Record<string, unknown> = {}, timeoutMs = 30_000): Promise<unknown> {
    if (!this.isConnected(profileId)) return Promise.reject(new Error('BROWSER_BRIDGE_DISCONNECTED'));
    const command = { id: randomUUID(), type, payload };
    const queue = this.queues.get(profileId) ?? [];
    queue.push(command);
    this.queues.set(profileId, queue);
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(command.id);
        reject(new Error(`BROWSER_BRIDGE_COMMAND_TIMEOUT:${type}`));
      }, timeoutMs);
      this.pending.set(command.id, { command, resolve, reject, timeout });
    });
  }

  private authenticated(request: IncomingMessage): boolean {
    return request.headers['x-ancv-bridge-token'] === this.config.bridgeToken;
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const url = new URL(request.url ?? '/', `http://${this.config.bridgeHost}:${this.config.bridgePort}`);
    if (request.method === 'GET' && url.pathname === '/setup') {
      const profileId = url.searchParams.get('profileId') ?? '';
      const nonce = url.searchParams.get('nonce') ?? '';
      const next = url.searchParams.get('next') ?? '';
      const setup = this.setupNonces.get(nonce);
      if (!setup || setup.profileId !== profileId || setup.expiresAt < Date.now() || !next.startsWith('https://labs.google/')) {
        response.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' }).end('ANCV Browser Bridge setup không hợp lệ.');
        return;
      }
      const escape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      response.end(`<!doctype html><meta name="ancv-profile-id" content="${escape(profileId)}"><meta name="ancv-setup-nonce" content="${escape(nonce)}"><meta name="ancv-next-url" content="${escape(next)}"><title>ANCV Browser Bridge</title><p id="status">Đang kết nối ANCV Browser Bridge…</p>`);
      return;
    }
    if (request.method === 'POST' && url.pathname === '/v1/bridge/register') {
      const input = await body(request);
      const profileId = String(input.profileId ?? '');
      const nonce = String(input.nonce ?? '');
      const bridgeId = String(input.bridgeId ?? '');
      const setup = this.setupNonces.get(nonce);
      if (!setup || setup.profileId !== profileId || setup.expiresAt < Date.now() || !bridgeId) {
        json(response, 403, { error: 'BRIDGE_SETUP_DENIED' }); return;
      }
      this.setupNonces.delete(nonce);
      this.connected.set(profileId, { bridgeId, lastSeen: Date.now() });
      console.log(JSON.stringify({ event: 'browser_bridge_registered', profileId }));
      json(response, 200, { token: this.config.bridgeToken }); return;
    }
    if (!this.authenticated(request)) { json(response, 401, { error: 'BRIDGE_UNAUTHORIZED' }); return; }
    if (request.method === 'POST' && url.pathname === '/v1/bridge/heartbeat') {
      const input = await body(request);
      const profileId = String(input.profileId ?? '');
      const bridgeId = String(request.headers['x-ancv-bridge-id'] ?? '');
      if (!profileId || !bridgeId) { json(response, 400, { error: 'BRIDGE_ID_REQUIRED' }); return; }
      this.connected.set(profileId, { bridgeId, lastSeen: Date.now() });
      json(response, 200, { ok: true }); return;
    }
    if (request.method === 'GET' && url.pathname === '/v1/bridge/commands/next') {
      const profileId = url.searchParams.get('profileId') ?? '';
      const queue = this.queues.get(profileId) ?? [];
      const command = queue.shift();
      this.queues.set(profileId, queue);
      if (!command) { response.writeHead(204).end(); return; }
      console.log(JSON.stringify({ event: 'browser_bridge_command_sent', profileId, command: command.type }));
      json(response, 200, command); return;
    }
    const resultMatch = url.pathname.match(/^\/v1\/bridge\/commands\/([^/]+)\/result$/);
    if (request.method === 'POST' && resultMatch) {
      const commandId = decodeURIComponent(resultMatch[1] ?? '');
      const waiting = this.pending.get(commandId);
      if (!waiting) { json(response, 404, { error: 'COMMAND_NOT_FOUND' }); return; }
      const input = await body(request);
      clearTimeout(waiting.timeout);
      this.pending.delete(commandId);
      if (input.ok === true) waiting.resolve(input.result);
      else waiting.reject(new Error(String(input.error ?? 'BROWSER_BRIDGE_COMMAND_FAILED')));
      console.log(JSON.stringify({ event: 'browser_bridge_command_result', command: waiting.command.type, ok: input.ok === true }));
      json(response, 200, { ok: true }); return;
    }
    json(response, 404, { error: 'BRIDGE_ROUTE_NOT_FOUND' });
  }
}
