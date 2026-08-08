import crypto from 'crypto';
import env from '../config/env.js';

// Short, unguessable, stateless "view this entry" link token — no DB row.
// The entry id plus an HMAC over "id.exp", so a public
// GET /public/entries/:token can trust the id without a database round trip.
//
// Uses a dedicated SHARE_TOKEN_SECRET (falling back to the JWT secret only in
// dev) so the login secret can be rotated in an incident without silently
// invalidating every share link already sent over WhatsApp — and vice versa.
// An expiry is baked in so a forwarded link doesn't stay live forever; set
// SHARE_TOKEN_TTL_SEC=0 to keep the old never-expires behaviour.
const sign = (payload) =>
  crypto.createHmac('sha256', env.shareTokenSecret).update(payload).digest('base64url').slice(0, 16);

// Verifier for tokens minted by the previous scheme (HMAC over the bare id,
// using the JWT access secret). Kept only so links sent before this change
// don't break.
const signLegacy = (entryId) =>
  crypto.createHmac('sha256', env.jwt.accessSecret).update(entryId).digest('base64url').slice(0, 16);

export const signEntryToken = (entryId) => {
  const exp = env.shareTokenTtlSec > 0
    ? Math.floor(Date.now() / 1000) + env.shareTokenTtlSec
    : 0;
  const idPart = Buffer.from(entryId).toString('base64url');
  return `${idPart}.${exp}.${sign(`${entryId}.${exp}`)}`;
};

export const verifyEntryToken = (token) => {
  const parts = String(token).split('.');
  // New format: id.exp.sig. Old format (id.sig) is still accepted so links
  // minted before this change keep working.
  let idPart; let expPart; let sig;
  if (parts.length === 3) {
    [idPart, expPart, sig] = parts;
  } else if (parts.length === 2) {
    [idPart, sig] = parts;
    expPart = null;
  } else {
    return null;
  }

  let entryId;
  try {
    entryId = Buffer.from(idPart, 'base64url').toString('utf8');
  } catch {
    return null;
  }

  const expected = expPart === null ? signLegacy(entryId) : sign(`${entryId}.${expPart}`);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  if (expPart !== null) {
    const exp = Number(expPart);
    if (exp !== 0 && (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000))) return null;
  }
  return entryId;
};
