import { timingSafeEqual } from 'node:crypto';
import { config } from './config.js';

function safeEqual(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function basicAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, encoded] = header.split(' ');
  if (scheme === 'Basic' && encoded) {
    const [user, pass] = Buffer.from(encoded, 'base64').toString('utf8').split(':');
    if (user && pass && safeEqual(user, config.authUser) && safeEqual(pass, config.authPassword)) {
      return next();
    }
  }
  res.set('WWW-Authenticate', 'Basic realm="FinBook Backup Tool"');
  res.status(401).send('Authentication required');
}
