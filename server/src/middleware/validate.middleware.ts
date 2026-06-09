import type { Request, Response, NextFunction } from 'express';
import type { ZodTypeAny } from 'zod';

type Source = 'body' | 'query' | 'params';

export const validate =
  (schema: ZodTypeAny, source: Source = 'body') =>
  (req: Request, _res: Response, next: NextFunction): void => {
    const parsed = schema.parse(req[source]);
    // Mutate to the parsed (sanitized) shape
    (req as unknown as Record<Source, unknown>)[source] = parsed;
    next();
  };
