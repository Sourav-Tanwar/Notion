/**
 * One-off backfill: Slice 7.2 migration to the multi-tenant data model.
 *
 * For every user:
 *   1. Ensure a personal workspace exists (via the same path used at runtime
 *      so the script and the live system can never disagree).
 *   2. Stamp `workspaceId` on every Page they own that's missing one.
 *   3. Stamp `workspaceId` on every Block under those pages.
 *
 * Idempotent: re-running is a no-op once everything is migrated. Safe to run
 * on a live database because the writes are pure additive `$set`s — no
 * existing field is mutated.
 *
 * Usage:  npx tsx src/scripts/backfill-workspaces.ts
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../config/db';
import { UserModel } from '../modules/auth/auth.model';
import { PageModel } from '../modules/pages/pages.model';
import { BlockModel } from '../modules/blocks/blocks.model';
import { workspacesService } from '../modules/workspaces/workspaces.service';

async function main() {
  await connectDB();
  // eslint-disable-next-line no-console
  console.log('[backfill] starting');

  const users = await UserModel.find().select('_id email').lean();
  let pagesUpdated = 0;
  let blocksUpdated = 0;

  for (const u of users) {
    const ws = await workspacesService.ensurePersonal(String(u._id));
    const wsId = (ws as any)._id;

    // Pages owned by this user but missing a workspaceId.
    const legacy = await PageModel.find({
      ownerId: u._id,
      $or: [{ workspaceId: { $exists: false } }, { workspaceId: null }],
    })
      .select('_id')
      .lean();

    if (!legacy.length) continue;
    const pageIds = legacy.map((p) => p._id);

    const pageRes = await PageModel.updateMany(
      { _id: { $in: pageIds } },
      { $set: { workspaceId: wsId } },
    );
    pagesUpdated += pageRes.modifiedCount ?? 0;

    const blockRes = await BlockModel.updateMany(
      { pageId: { $in: pageIds } },
      { $set: { workspaceId: wsId } },
    );
    blocksUpdated += blockRes.modifiedCount ?? 0;

    // eslint-disable-next-line no-console
    console.log(
      `[backfill] user=${u.email} ws=${wsId} pages=${pageRes.modifiedCount} blocks=${blockRes.modifiedCount}`,
    );
  }

  // eslint-disable-next-line no-console
  console.log(`[backfill] done. pages=${pagesUpdated} blocks=${blocksUpdated}`);
  await mongoose.disconnect();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[backfill] failed:', err);
  process.exit(1);
});
