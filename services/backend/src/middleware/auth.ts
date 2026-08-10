import type { NextFunction, Request, Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { db, firebaseAuth } from '../firebase.js';
import { config } from '../config.js';

export async function requireFirebaseEditor(request: Request, response: Response, next: NextFunction) {
  try {
    const token = request.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!token) { response.status(401).json({ error: 'AUTH_REQUIRED' }); return; }
    const identity = await firebaseAuth().verifyIdToken(token, true);
    const user = await db().collection('users').doc(identity.uid).get();
    if (!user.exists || user.data()?.status !== 'active' || !['admin', 'editor'].includes(user.data()?.role)) {
      response.status(403).json({ error: 'EDITOR_REQUIRED' }); return;
    }
    response.locals.identity = { uid: identity.uid, email: identity.email ?? null, role: user.data()?.role };
    next();
  } catch { response.status(401).json({ error: 'INVALID_TOKEN' }); }
}

export async function requireFirebaseAdmin(request: Request, response: Response, next: NextFunction) {
  await requireFirebaseEditor(request, response, () => {
    if (response.locals.identity?.role !== 'admin') { response.status(403).json({ error: 'ADMIN_REQUIRED' }); return; }
    next();
  });
}

const aiWindows = new Map<string, number[]>();
export function requireAIRateLimit(_request: Request, response: Response, next: NextFunction) {
  const uid = response.locals.identity?.uid;
  if (!uid) { response.status(401).json({ error: 'AUTH_REQUIRED' }); return; }
  const cutoff = Date.now() - 10 * 60_000;
  const recent = (aiWindows.get(uid) ?? []).filter((time) => time > cutoff);
  if (recent.length >= config.aiRateLimitPerTenMinutes) {
    response.status(429).json({ error: 'AI_RATE_LIMIT', message: 'Đã đạt giới hạn AI tạm thời. Vui lòng thử lại sau.' }); return;
  }
  recent.push(Date.now()); aiWindows.set(uid, recent); next();
}

const googleClient = new OAuth2Client();
export async function requireAutomationIdentity(request: Request, response: Response, next: NextFunction) {
  try {
    const token = request.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!token || !config.taskAudience) { response.status(401).json({ error: 'AUTOMATION_AUTH_REQUIRED' }); return; }
    const ticket = await googleClient.verifyIdToken({ idToken: token, audience: config.taskAudience });
    const email = ticket.getPayload()?.email ?? '';
    const allowed = new Set((process.env.AUTOMATION_SERVICE_ACCOUNTS ?? '').split(',').filter(Boolean));
    if (!allowed.has(email)) { response.status(403).json({ error: 'AUTOMATION_IDENTITY_DENIED' }); return; }
    response.locals.identity = { uid: email, email, role: 'automation' };
    next();
  } catch { response.status(401).json({ error: 'INVALID_AUTOMATION_TOKEN' }); }
}
