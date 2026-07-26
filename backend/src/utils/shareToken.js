import crypto from 'crypto';
import env from '../config/env.js';

// Short, unguessable, stateless "view this entry" link token — no DB row,
// no expiry to manage. Just the entry id plus an HMAC over it, so a public
// GET /public/entries/:token can trust the id without a database round trip
// to check a secret first. Reuses the JWT access secret rather than adding
// a new env var to manage on top of the two already there.
const sign = (entryId) =>
  crypto.createHmac('sha256', env.jwt.accessSecret).update(entryId).digest('base64url').slice(0, 16);

export const signEntryToken = (entryId) => `${Buffer.from(entryId).toString('base64url')}.${sign(entryId)}`;

export const verifyEntryToken = (token) => {
  const [idPart, sig] = String(token).split('.');
  if (!idPart || !sig) return null;
  let entryId;
  try {
    entryId = Buffer.from(idPart, 'base64url').toString('utf8');
  } catch {
    return null;
  }
  const expected = sign(entryId);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return entryId;
};
