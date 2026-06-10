import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { env, isProd } from './config/env';
import { connectDB } from './config/db';
import { authRouter } from './modules/auth/auth.routes';
import { profileRouter } from './modules/profile/profile.routes';
import { pagesRouter } from './modules/pages/pages.routes';
import { pagesService } from './modules/pages/pages.service';
import { blocksRouter } from './modules/blocks/blocks.routes';
import { commentsRouter } from './modules/comments/comments.routes';
import { notificationsRouter } from './modules/notifications/notifications.routes';
import { searchRouter } from './modules/search/search.routes';
import { databaseRouter } from './modules/database/database.routes';
import { aiRouter } from './modules/ai/ai.routes';
import { workspacesRouter } from './modules/workspaces/workspaces.routes';
import { inviteePreviewRouter } from './modules/workspaces/invitations.routes';
import { publicShareRouter } from './modules/workspaces/shareLinks.routes';
import { errorHandler } from './middleware/error.middleware';
import { notFound } from './middleware/notFound.middleware';
import { registerAccountDeletionHook } from './modules/auth/auth.service';
import { PageModel } from './modules/pages/pages.model';
import { BlockModel } from './modules/blocks/blocks.model';
import { CommentModel } from './modules/comments/comments.model';
import { NotificationModel } from './modules/notifications/notifications.model';
import { MembershipModel, WorkspaceModel } from './modules/workspaces/workspaces.model';
import { ShareLinkModel } from './modules/workspaces/shareLinks.model';
import { DocSnapshotModel } from './realtime/snapshot.model';

/**
 * Account-deletion cascade.
 *
 * After 7.2, pages/blocks are keyed by workspace, not user. So the cascade now:
 *   1. Drops the user's memberships in every workspace (so they vanish from
 *      member lists immediately).
 *   2. For each personal workspace they owned: deletes its blocks, pages, and
 *      the workspace itself. Personal workspaces are 1:1 with the user — no
 *      one else can ever be a member.
 *   3. Team workspaces are LEFT ALONE. Other members keep their data; if the
 *      deleted user was the sole owner, an admin can promote themselves out
 *      of band. (Forcing an ownership transfer on delete is a product call —
 *      handled in Slice 7.3 once invitations land.)
 *
 * Hooks must be idempotent: partial failure does not unwind earlier steps.
 */
registerAccountDeletionHook(async (userId) => {
  const personalWorkspaces = await WorkspaceModel.find({
    createdBy: userId,
    kind: 'personal',
  })
    .select('_id')
    .lean();
  const personalIds = personalWorkspaces.map((w) => w._id);

  if (personalIds.length) {
    // Collect the page ids first so we can drop their realtime snapshots
    // alongside the relational rows. The DocSnapshot collection is keyed
    // by page id, not workspace id.
    const pageIds = await PageModel.find({ workspaceId: { $in: personalIds } })
      .select('_id')
      .lean();
    const pageIdStrings = pageIds.map((p) => String(p._id));
    await BlockModel.deleteMany({ workspaceId: { $in: personalIds } });
    await CommentModel.deleteMany({ workspaceId: { $in: personalIds } });
    await NotificationModel.deleteMany({ workspaceId: { $in: personalIds } });
    await PageModel.deleteMany({ workspaceId: { $in: personalIds } });
    await ShareLinkModel.deleteMany({ workspaceId: { $in: personalIds } });
    await DocSnapshotModel.deleteMany({ _id: { $in: pageIdStrings } });
    await WorkspaceModel.deleteMany({ _id: { $in: personalIds } });
  }
  await MembershipModel.deleteMany({ userId });
});

async function bootstrap() {
  await connectDB();

  const app = express();
  app.set('trust proxy', 1); // behind a reverse proxy in prod → correct req.ip
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: env.clientOrigin, credentials: true }));
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());

  // Serve uploaded files (avatars). In prod, prefer a CDN in front of these.
  app.use(`/${env.uploadDir}`, express.static(path.resolve(env.uploadDir), {
    maxAge: isProd ? '7d' : 0,
    immutable: isProd,
  }));

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api/auth', authRouter);
  app.use('/api/profile', profileRouter);
  app.use('/api/workspaces', workspacesRouter);
  app.use('/api/invitations', inviteePreviewRouter);
  app.use('/api/public', publicShareRouter);
  app.use('/api/pages', pagesRouter);
  app.use('/api/blocks', blocksRouter);
  app.use('/api/comments', commentsRouter);
  app.use('/api/notifications', notificationsRouter);
  app.use('/api/search', searchRouter);
  app.use('/api/databases', databaseRouter);
  app.use('/api/ai', aiRouter);

  app.use(notFound);
  app.use(errorHandler);

  app.listen(env.port, () => {
    // eslint-disable-next-line no-console
    console.log(`[server] listening on :${env.port}`);
  });

  // Periodic Trash auto-purge: permanently delete pages that have been in
  // Trash longer than the retention window. Runs once at startup and then
  // on an interval. Disabled when retention is 0.
  if (env.trashRetentionDays > 0) {
    const sweep = async () => {
      try {
        const { purged } = await pagesService.purgeExpiredTrash(env.trashRetentionDays);
        if (purged > 0) {
          // eslint-disable-next-line no-console
          console.log(`[trash] auto-purged ${purged} expired page(s)`);
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[trash] purge sweep failed', err);
      }
    };
    void sweep();
    const timer = setInterval(() => void sweep(), env.trashSweepIntervalMs);
    timer.unref?.();
  }
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
