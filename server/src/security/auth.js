import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { config } from '../config.js';

const scryptAsync = promisify(crypto.scrypt);

function base64UrlEncode(input) {
  const raw = Buffer.isBuffer(input) ? input : Buffer.from(String(input), 'utf8');
  return raw.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(input) {
  const normalized = String(input || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, 'base64');
}

function getJwtSecret() {
  const secret = String(config.authJwtSecret || '').trim();
  if (secret) return secret;
  return `dev-trackflow-secret-${config.defaultCoachId}`;
}

export async function hashPassword(password) {
  const safe = String(password || '');
  if (!safe) throw new Error('Password vacio.');
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = await scryptAsync(safe, salt, 64);
  return `scrypt$${salt}$${Buffer.from(derived).toString('hex')}`;
}

export async function verifyPassword(password, passwordHash) {
  const safePassword = String(password || '');
  const safeHash = String(passwordHash || '');
  if (!safePassword || !safeHash) return false;
  const parts = safeHash.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const salt = parts[1];
  const stored = parts[2];
  const derived = await scryptAsync(safePassword, salt, 64);
  const storedBuf = Buffer.from(stored, 'hex');
  const derivedBuf = Buffer.from(derived);
  if (storedBuf.length !== derivedBuf.length) return false;
  return crypto.timingSafeEqual(storedBuf, derivedBuf);
}

export function signSessionToken(payload = {}) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const ttl = Math.max(Number(config.authJwtTtlSec || 0), 60);
  const fullPayload = {
    ...payload,
    iat: now,
    exp: now + ttl,
  };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));
  const data = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto
    .createHmac('sha256', getJwtSecret())
    .update(data)
    .digest();
  return `${data}.${base64UrlEncode(signature)}`;
}

export function verifySessionToken(token) {
  const safeToken = String(token || '').trim();
  if (!safeToken) return null;
  const [encodedHeader, encodedPayload, encodedSignature] = safeToken.split('.');
  if (!encodedHeader || !encodedPayload || !encodedSignature) return null;
  const data = `${encodedHeader}.${encodedPayload}`;
  const expectedSig = crypto
    .createHmac('sha256', getJwtSecret())
    .update(data)
    .digest();
  const providedSig = base64UrlDecode(encodedSignature);
  if (providedSig.length !== expectedSig.length) return null;
  if (!crypto.timingSafeEqual(providedSig, expectedSig)) return null;

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload).toString('utf8'));
    const now = Math.floor(Date.now() / 1000);
    if (!payload?.exp || Number(payload.exp) <= now) return null;
    return payload;
  } catch {
    return null;
  }
}

export function parseCookieHeader(rawCookie = '') {
  const cookies = {};
  String(rawCookie || '')
    .split(';')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .forEach((segment) => {
      const idx = segment.indexOf('=');
      if (idx <= 0) return;
      const key = decodeURIComponent(segment.slice(0, idx).trim());
      const value = decodeURIComponent(segment.slice(idx + 1).trim());
      cookies[key] = value;
    });
  return cookies;
}

export function buildAuthCookie(token, options = {}) {
  const name = config.authCookieName;
  const maxAge = Math.max(Number(config.authJwtTtlSec || 0), 60);
  const secure = options?.secure ?? config.authCookieSecure;
  const attrs = [
    `${name}=${encodeURIComponent(token)}`,
    `Max-Age=${maxAge}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (secure) attrs.push('Secure');
  return attrs.join('; ');
}

export function buildClearAuthCookie(options = {}) {
  const secure = options?.secure ?? config.authCookieSecure;
  const attrs = [
    `${config.authCookieName}=`,
    'Max-Age=0',
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (secure) attrs.push('Secure');
  return attrs.join('; ');
}
