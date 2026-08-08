import crypto from 'crypto';
import env from '../config/env.js';

// Signs the /uploads URLs the API hands out so that bill photos, avatars and
// logos can't be fetched by anyone who simply knows (or guesses) the path.
// The signature rides in the query string, so it still works with a plain
// <img src> that can't send an Authorization header. Each URL carries an
// expiry, so a leaked link (referrer header, forwarded chat, proxy log)
// stops resolving after fileUrlTtlSec.
//
// The token binds to the filename only — not to a specific user — so it is a
// short-lived capability, not a full per-user ACL. That is a large step up
// from the previous "served to the whole internet with no auth at all", and
// is re-minted on every authenticated API response.

const sign = (name, exp) =>
  crypto.createHmac('sha256', env.fileUrlSecret)
    .update(`${name}.${exp}`)
    .digest('base64url')
    .slice(0, 24);

/** Appends ?exp&sig to a bare "/uploads/<name>" path. Leaves anything else
 *  (already-signed, absolute URLs, non-upload paths) untouched. */
export const signUploadPath = (value) => {
  if (typeof value !== 'string') return value;
  const m = value.match(/^\/uploads\/([A-Za-z0-9._-]+)$/);
  if (!m) return value;
  const name = m[1];
  const exp = Math.floor(Date.now() / 1000) + env.fileUrlTtlSec;
  return `/uploads/${name}?exp=${exp}&sig=${sign(name, exp)}`;
};

/** True when name+exp+sig verify and haven't expired. */
export const verifyUploadSig = (name, exp, sig) => {
  if (!name || !exp || !sig) return false;
  const expNum = Number(exp);
  if (!Number.isFinite(expNum) || expNum < Math.floor(Date.now() / 1000)) return false;
  const expected = sign(name, String(exp));
  const a = Buffer.from(String(sig));
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

/** Recursively rewrite every "/uploads/..." string in a JSON payload into a
 *  signed URL. One call covers every read endpoint, so no controller has to
 *  remember to sign — and no app change is needed, since the apps render
 *  whatever URL the API returns. */
export const signUploadsDeep = (val) => {
  if (typeof val === 'string') return signUploadPath(val);
  if (Array.isArray(val)) return val.map(signUploadsDeep);
  if (val && typeof val === 'object') {
    for (const k of Object.keys(val)) val[k] = signUploadsDeep(val[k]);
    return val;
  }
  return val;
};
