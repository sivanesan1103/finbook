import { ApiError } from '../utils/apiError.js';

/**
 * Zod validation middleware.
 * Usage: validate({ body: schema, query: schema, params: schema })
 */
export const validate = (schemas) => (req, _res, next) => {
  for (const key of ['params', 'query', 'body']) {
    const schema = schemas[key];
    if (!schema) continue;
    const result = schema.safeParse(req[key]);
    if (!result.success) {
      const details = result.error.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
      }));
      return next(ApiError.badRequest('Validation failed', details));
    }
    // Replace (not merge) — Zod strips unknown/disallowed keys in result.data,
    // and merging onto the original req[key] would leave those stripped keys
    // in place, letting them flow into `...req.body` spreads downstream.
    req[key] = result.data;
  }
  next();
};
