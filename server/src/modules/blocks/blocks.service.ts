import { Types } from 'mongoose';
import { BlockModel } from './blocks.model';
import { PageModel } from '../pages/pages.model';
import { HttpError } from '../../utils/HttpError';
import type { UpsertBlock } from './blocks.schema';
import {
  pagePermissionsService,
  PermissionCache,
} from '../workspaces/pagePermissions.service';
import { levelAtLeast, type PageLevel } from '../workspaces/pagePermissions';
import type { WorkspaceRole } from '../workspaces/workspaces.model';
import { notifyBlocksChanged, requestArchive } from '../../realtime/notify';

export interface BlockActor {
  userId: string;
  role: WorkspaceRole;
}

/**
 * Bulk ops carry their page ids in the body rather than the URL, so the
 * middleware-level `pageAccessGuard` can't reach them. We enforce here
 * instead, reusing the same resolver + per-call cache so an N-block / M-page
 * payload still costs O(M) resolutions, not O(N).
 */
async function assertPagesAt(
  workspaceId: string,
  actor: BlockActor,
  pageIds: string[],
  required: PageLevel,
): Promise<void> {
  const unique = [...new Set(pageIds)];
  if (!unique.length) return;
  const cache = new PermissionCache();
  for (const pid of unique) {
    const lvl = await pagePermissionsService.resolve(
      workspaceId,
      actor.userId,
      pid,
      actor.role,
      cache,
    );
    if (!levelAtLeast(lvl, required)) throw new HttpError(403, 'Forbidden');
  }
}

const toDTO = (b: any) => ({
  id: b._id,
  pageId: String(b.pageId),
  parentId: b.parentId,
  type: b.type,
  text: b.text,
  order: b.order,
  props: b.props ?? {},
});

/** Confirms the page exists inside the workspace the caller is operating in. */
async function assertPageInWorkspace(workspaceId: string, pageId: string) {
  const page = await PageModel.findOne({ _id: pageId, workspaceId }).select('_id').lean();
  if (!page) throw new HttpError(404, 'PageNotFound');
}

export const blocksService = {
  async listByPage(workspaceId: string, pageId: string) {
    await assertPageInWorkspace(workspaceId, pageId);
    // Filter on both keys: the index { workspaceId, pageId } handles this
    // efficiently and rejects cross-tenant page-id guesses at the planner.
    const blocks = await BlockModel.find({ workspaceId, pageId }).sort({ order: 1 }).lean();
    return blocks.map(toDTO);
  },

  /**
   * Bulk upsert. Used by debounced autosave and block creation.
   * Idempotent on client-generated IDs.
   *
   * We notify the realtime process only when this batch CREATES new blocks
   * (i.e. at least one id was not previously in Mongo). Text-only autosaves
   * — which fire roughly every keystroke debounce — would otherwise force
   * every connected tab to refetch the block list on every keystroke. Inline
   * text already syncs CRDT-style over Yjs, so that path needs no ping.
   */
  async upsertMany(workspaceId: string, actor: BlockActor, blocks: UpsertBlock[]) {
    if (!blocks.length) return { ok: true };
    const pageIds = [...new Set(blocks.map((b) => b.pageId))];
    const owned = await PageModel.find({ _id: { $in: pageIds }, workspaceId })
      .select('_id')
      .lean();
    if (owned.length !== pageIds.length) throw new HttpError(403, 'Forbidden');
    await assertPagesAt(workspaceId, actor, pageIds, 'edit');

    // Detect structural change: ids in the payload that don't yet exist.
    const incomingIds = blocks.map((b) => b.id);
    const existing = await BlockModel.find({ _id: { $in: incomingIds }, workspaceId })
      .select('_id')
      .lean();
    const existingIds = new Set(existing.map((e) => String(e._id)));
    const createdPages = new Set<string>();
    for (const b of blocks) {
      if (!existingIds.has(b.id)) createdPages.add(b.pageId);
    }

    const wsObjId = new Types.ObjectId(workspaceId);
    const ops = blocks.map((b) => ({
      updateOne: {
        filter: { _id: b.id },
        update: {
          $set: {
            workspaceId: wsObjId,
            pageId: b.pageId,
            parentId: b.parentId,
            type: b.type,
            text: b.text,
            order: b.order,
            props: b.props,
          },
        },
        upsert: true,
      },
    }));
    await BlockModel.bulkWrite(ops as Parameters<typeof BlockModel.bulkWrite>[0]);

    for (const pid of createdPages) notifyBlocksChanged(pid);
    for (const pid of pageIds) requestArchive(pid);
    return { ok: true };
  },

  async deleteMany(workspaceId: string, actor: BlockActor, ids: string[]) {
    if (!ids.length) return { ok: true };
    // Look up the affected pages once so we can authorize, then issue the
    // composite-filter delete. An attacker who guesses a block id from
    // another tenant gets a silent no-op rather than a deletion.
    const blocks = await BlockModel.find({ _id: { $in: ids }, workspaceId })
      .select('pageId')
      .lean();
    const pageIds = [...new Set(blocks.map((b) => String(b.pageId)))];
    await assertPagesAt(workspaceId, actor, pageIds, 'edit');
    await BlockModel.deleteMany({ _id: { $in: ids }, workspaceId });
    for (const pid of pageIds) notifyBlocksChanged(pid);
    for (const pid of pageIds) requestArchive(pid);
    return { ok: true };
  },

  async reorder(
    workspaceId: string,
    actor: BlockActor,
    items: { id: string; parentId: string | null; order: number }[],
  ) {
    if (!items.length) return { ok: true };
    const affected = await BlockModel.find({
      _id: { $in: items.map((i) => i.id) },
      workspaceId,
    })
      .select('pageId')
      .lean();
    const pageIds = [...new Set(affected.map((b) => String(b.pageId)))];
    await assertPagesAt(workspaceId, actor, pageIds, 'edit');

    const ops = items.map((it) => ({
      updateOne: {
        filter: { _id: it.id, workspaceId },
        update: { parentId: it.parentId, order: it.order },
      },
    }));
    await BlockModel.bulkWrite(ops);
    for (const pid of pageIds) notifyBlocksChanged(pid);
    for (const pid of pageIds) requestArchive(pid);
    return { ok: true };
  },
};
