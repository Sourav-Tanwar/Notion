import { AuthEventModel, type AuthEventType } from '../modules/auth/authEvent.model';

export interface AuditContext {
  userId?: string | null;
  email?: string | null;
  ip?: string;
  userAgent?: string;
  meta?: Record<string, unknown>;
}

/**
 * Fire-and-forget audit log writer.
 *
 * Audit writes are deliberately *not* awaited at call sites — we never want a
 * log failure to break the user flow. The internal `.catch` swallows errors
 * and emits a single console warning so ops can see them without producing
 * thousands of duplicate stack traces in case of a DB outage.
 *
 * If you need an awaited write (e.g. a security alert pipeline), use
 * `audit.writeAwaited` instead.
 */
export const audit = {
  log(type: AuthEventType, ctx: AuditContext = {}): void {
    AuthEventModel.create({
      type,
      userId: ctx.userId ?? null,
      email: ctx.email ?? null,
      ip: ctx.ip ?? '',
      userAgent: ctx.userAgent ?? '',
      meta: ctx.meta ?? {},
    }).catch((e) => {
      // eslint-disable-next-line no-console
      console.warn('[audit] write failed:', type, (e as Error).message);
    });
  },

  async writeAwaited(type: AuthEventType, ctx: AuditContext = {}): Promise<void> {
    await AuthEventModel.create({
      type,
      userId: ctx.userId ?? null,
      email: ctx.email ?? null,
      ip: ctx.ip ?? '',
      userAgent: ctx.userAgent ?? '',
      meta: ctx.meta ?? {},
    });
  },
};
