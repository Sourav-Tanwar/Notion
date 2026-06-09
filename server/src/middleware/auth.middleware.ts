import type { Request, Response, NextFunction } from 'express';
import { tokenService } from '../modules/auth/token.service';
import { UserModel } from '../modules/auth/auth.model';
import { HttpError } from '../utils/HttpError';
import { env } from '../config/env';

export interface AuthedRequest extends Request {
  userId?: string;
  userRole?: string;
  userTokenVersion?: number;
}

/**
 * Verifies the Bearer access token. tokenVersion claim is captured here but
 * NOT yet validated against the DB — see `requireFreshUser` for that. The
 * separation keeps the hot-path stateless: ~99% of requests are pure JWT
 * verifies with no DB roundtrip.
 */
export function authGuard(req: AuthedRequest, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  if (!token) throw new HttpError(401, 'Unauthorized');

  let payload;
  try {
    payload = tokenService.verifyAccess(token);
  } catch {
    throw new HttpError(401, 'InvalidToken');
  }

  req.userId = payload.sub;
  req.userRole = payload.role;
  req.userTokenVersion = payload.tv;
  next();
}

/** Sensitive ops only: pays a DB lookup to re-confirm session is still valid. */
export async function requireFreshUser(
  req: AuthedRequest,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const user = await UserModel.findById(req.userId).lean();
  if (!user) throw new HttpError(401, 'Unauthorized');
  if ((user.tokenVersion ?? 0) !== req.userTokenVersion) throw new HttpError(401, 'StaleSession');
  next();
}

export function requireVerifiedEmail(
  req: AuthedRequest,
  _res: Response,
  next: NextFunction,
): void {
  if (!env.emailVerificationRequired) return next();
  UserModel.findById(req.userId)
    .lean()
    .then((u) => {
      if (!u?.emailVerified) throw new HttpError(403, 'EmailNotVerified');
      next();
    })
    .catch(next);
}

export function requireRole(...roles: string[]) {
  return (req: AuthedRequest, _res: Response, next: NextFunction): void => {
    if (!req.userRole || !roles.includes(req.userRole)) throw new HttpError(403, 'Forbidden');
    next();
  };
}
