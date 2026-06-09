import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { HttpError } from '../utils/HttpError';

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  if (err instanceof ZodError) {
    res.status(400).json({ error: 'ValidationError', details: err.flatten() });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, details: err.details });
    return;
  }
  // Mongo duplicate-key races (e.g. two concurrent signups with the same
  // email) surface as MongoServerError code 11000. Map to 409 so the client
  // gets a useful error instead of a generic 500.
  const e = err as { name?: string; code?: number; keyPattern?: Record<string, unknown> };
  if (e?.code === 11000) {
    const field = e.keyPattern ? Object.keys(e.keyPattern)[0] : 'field';
    const code = field === 'email' ? 'EmailInUse'
      : field === 'username' ? 'UsernameTaken'
      : 'DuplicateKey';
    res.status(409).json({ error: code, details: { field } });
    return;
  }
  // eslint-disable-next-line no-console
  console.error('[unhandled]', err);
  res.status(500).json({ error: 'InternalServerError' });
}
