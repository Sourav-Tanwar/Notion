import type { Request, Response, NextFunction } from 'express';

/** Wrap async route handlers so thrown errors flow to the error middleware. */
export const asyncHandler =
  <T extends Request = Request>(fn: (req: T, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: T, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
