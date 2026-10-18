import crypto from 'crypto';
import { cookies } from 'next/headers';
import { getDb } from './db';

const SESSION_SECRET = process.env.SESSION_SECRET || 'inwaster-secret-key-2026-production';
const COOKIE_NAME = 'inwaster_session';

export const ADMIN_EMAIL = 'admin@inwaster.org';
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'InWasterAdmin2026!';

export interface SessionData {
  mail: string;
  name: string;
  isAdmin: boolean;
  exp: number;
}

// ---------------------------------------------------------------------------
// Password Hashing (Werkzeug PBKDF2 compatible)
// ---------------------------------------------------------------------------

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(12).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 16);
  const iterations = 260000;
  const derived = crypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256');
  return `pbkdf2:sha256:${iterations}$${salt}$${derived.toString('hex')}`;
}

export function verifyPassword(storedHash: string, plain: string): boolean {
  if (!storedHash) return false;

  // PBKDF2 Werkzeug style
  if (storedHash.startsWith('pbkdf2:')) {
    const parts = storedHash.split('$');
    if (parts.length !== 3) return false;
    const header = parts[0]; // e.g. pbkdf2:sha256:260000
    const salt = parts[1];
    const hashHex = parts[2];
    const subParts = header.split(':');
    const hashAlgo = subParts[1] || 'sha256';
    const iterations = parseInt(subParts[2], 10) || 260000;

    const derived = crypto.pbkdf2Sync(plain, salt, iterations, hashHex.length / 2, hashAlgo);
    return crypto.timingSafeEqual(Buffer.from(derived.toString('hex')), Buffer.from(hashHex));
  }

  // Scrypt or Argon2 fallback
  if (storedHash.startsWith('scrypt:') || storedHash.startsWith('argon2:')) {
    return false;
  }

  // Legacy plaintext fallback
  return storedHash === plain;
}

// ---------------------------------------------------------------------------
// Session Token & HMAC Cookie
// ---------------------------------------------------------------------------

export function signToken(payload: object): string {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('base64url');
  return `${data}.${signature}`;
}

export function verifyToken<T>(token: string): T | null {
  try {
    const [data, signature] = token.split('.');
    if (!data || !signature) return null;

    const expected = crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('base64url');
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
      return null;
    }

    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    if (payload.exp && Date.now() > payload.exp) {
      return null;
    }

    return payload as T;
  } catch {
    return null;
  }
}

export function createSessionCookie(mail: string, name: string, isAdmin: boolean) {
  const exp = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days
  const token = signToken({ mail, name, isAdmin, exp });
  return {
    name: COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === 'true',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 7 * 24 * 60 * 60,
  };
}

export async function getSession(): Promise<SessionData | null> {
  const cookieStore = cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken<SessionData>(token);
}

export function verifyUserCredentials(mail: string, pass: string): { ok: boolean; name?: string; isAdmin?: boolean; error?: string } {
  const cleanMail = mail.trim().toLowerCase();
  
  // Admin check
  if (cleanMail === ADMIN_EMAIL && pass === ADMIN_PASSWORD) {
    return { ok: true, name: 'Administrator', isAdmin: true };
  }

  const db = getDb();
  const user = db.prepare('SELECT mail, passwd, name, role FROM users WHERE lower(mail) = ?').get(cleanMail) as any;

  if (!user) {
    return { ok: false, error: 'Invalid email or password' };
  }

  const valid = verifyPassword(user.passwd, pass);
  if (!valid) {
    return { ok: false, error: 'Invalid email or password' };
  }

  // Upgrade legacy plaintext password if needed
  if (!user.passwd.startsWith('pbkdf2:')) {
    db.prepare('UPDATE users SET passwd = ? WHERE lower(mail) = ?').run(hashPassword(pass), cleanMail);
  }

  return {
    ok: true,
    name: user.name || cleanMail.split('@')[0],
    isAdmin: user.role === 'admin'
  };
}

export function getDeviceTokenFromHeaders(headers: Headers): string {
  const token = headers.get('x-device-token');
  if (token) return token.trim();
  const auth = headers.get('authorization') || '';
  if (auth.startsWith('Bearer ')) {
    return auth.slice(7).trim();
  }
  return '';
}
