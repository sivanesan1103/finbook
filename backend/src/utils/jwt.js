import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import env from '../config/env.js';

export const signAccessToken = (user) =>
  jwt.sign({ sub: user.id, role: user.role, name: user.name }, env.jwt.accessSecret, {
    expiresIn: env.jwt.accessExpires,
  });

// `jti` makes every refresh token unique even for the same user within the
// same second — without it, two logins (or refreshes) for the same user
// in the same wall-clock second produced a byte-identical JWT (same
// header/payload/secret, `iat` only has second resolution), and the second
// prisma.refreshToken.create() hit the unique constraint on `token`,
// failing the whole login/refresh with an opaque 409.
export const signRefreshToken = (user) =>
  jwt.sign({ sub: user.id, type: 'refresh', jti: crypto.randomUUID() }, env.jwt.refreshSecret, {
    expiresIn: env.jwt.refreshExpires,
  });

export const verifyAccessToken = (token) => jwt.verify(token, env.jwt.accessSecret);
export const verifyRefreshToken = (token) => jwt.verify(token, env.jwt.refreshSecret);
