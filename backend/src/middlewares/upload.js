import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import env from '../config/env.js';
import { ApiError } from '../utils/apiError.js';

fs.mkdirSync(env.upload.dir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, env.upload.dir),
  filename: (_req, file, cb) =>
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${path.extname(file.originalname)}`),
});

const ALLOWED = ['.png', '.jpg', '.jpeg', '.webp', '.pdf'];

export const upload = multer({
  storage,
  limits: { fileSize: env.upload.maxMb * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED.includes(ext)) return cb(ApiError.badRequest(`File type ${ext} not allowed`));
    cb(null, true);
  },
});

export const fileUrl = (req) => (req.file ? `/uploads/${req.file.filename}` : undefined);
