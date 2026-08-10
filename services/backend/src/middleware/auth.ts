import type { NextFunction, Request, Response } from 'express';
import { getAuth } from 'firebase-admin/auth';
import { OAuth2Client } from 'google-auth-library';
import { db } from '../firebase.js';
import { config } from '../config.js';

export async function requireFirebaseEditor(request: Request, response: Response, next: NextFunction) {
  try {
    const token = request.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!token) { response.status(401).json({ error: 'AUTH_REQUIRED' }); return; }
    const identity = await getAuth().verifyIdToken(token, true);
    const user = await db().collection('users').doc(identity.uid).get();
    if (!user.exists || user.data()?.status !== 'active' || !['admin', 'editor'].includes(user.data()?.role)) {
      response.status(403).json({ error: 'EDITOR_REQUIRED' }); return;
    }
    response.locals.identity = { uid: identity.uid, email: identity.email ?? null, role: user.data()?.role };
    next();
  } catch { response.status(401).json({ error: 'INVALID_TOKEN' }); }
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
    next();
  } catch { response.status(401).json({ error: 'INVALID_AUTOMATION_TOKEN' }); }
}
