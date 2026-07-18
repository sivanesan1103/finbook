import jwt from 'jsonwebtoken';
import env from '../config/env.js';

export const signAccessToken = (user) =>
  jwt.sign({ sub: user.id, role: user.role, name: user.name }, env.jwt.accessSecret, {
    expiresIn: env.jwt.accessExpires,
  });

export const signRefreshToken = (user) =>
  jwt.sign({ sub: user.id, type: 'refresh' }, env.jwt.refreshSecret, {
    expiresIn: env.jwt.refreshExpires,
  });

export const verifyAccessToken = (token) => jwt.verify(token, env.jwt.accessSecret);
export const verifyRefreshToken = (token) => jwt.verify(token, env.jwt.refreshSecret);
