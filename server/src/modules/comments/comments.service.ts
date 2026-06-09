import { Types, isValidObjectId } from 'mongoose';
import { CommentModel } from './comments.model';
import { UserModel } from '../auth/auth.model';
import { PageModel } from '../pages/pages.model';
import { HttpError } from '../../utils/HttpError';
import {
  pagePermissionsService,
  PermissionCache,
} from '../workspaces/pagePermissions.service';
import { levelAtLeast, type PageLevel } from '../workspaces/pagePermissions';
import type { WorkspaceRole } from '../workspaces/workspaces.model';
import { MembershipModel } from '../workspaces/workspaces.model';
import { notifyCommentsChanged } from '../../realtime/notify';
import { notificationsService, type CreateNotificationInput } from '../notifications/notifications.service';
import type { CreateCommentInput, UpdateCommentInput } from './comments.schema';

/** Strip HTML tags / collapse whitespace into a short plain-text preview. */
function previewOf(body: string, max = 140): string {
  return body
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

export interface CommentActor {
  userId: string;
  role: WorkspaceRole;
}

interface AuthorLite {
  id: string;
  name: string;
  avatarUrl: string | null;
}

/** Collapse raw reaction sub-docs into per-emoji counts + the viewer's own state. */
function groupReactions(
  raw: any[],
  viewerId: string | null,
): Array<{ emoji: string; count: number; mine: boolean }> {
  const map = new Map<string, { emoji: string; count: number; mine: boolean }>();
  for (const r of raw ?? []) {
    const emoji = String(r.emoji);
    const cur = map.get(emoji) ?? { emoji, count: 0, mine: false };
    cur.count += 1;
    if (viewerId && String(r.userId) === viewerId) cur.mine = true;
    map.set(emoji, cur);
  }
  return [...map.values()];
}

const toDTO = (c: any, author: AuthorLite | null, viewerId: string | null = null) => ({
  id: String(c._id),
  pageId: String(c.pageId),
  blockId: c.blockId ?? null,
  quote: c.quote ?? null,
  parentId: c.parentId ? String(c.parentId) : null,
  authorId: String(c.authorId),
  author,
  body: c.deletedAt ? '' : c.body,
  resolved: !!c.resolved,
  deleted: !!c.deletedAt,
  reactions: groupReactions(c.reactions, viewerId),
  createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : c.createdAt,
  updatedAt: c.updatedAt instanceof Date ? c.updatedAt.toISOString() : c.updatedAt,
});

export type CommentDTO = ReturnType<typeof toDTO>;

/** Confirms the page exists inside the workspace the caller is operating in. */
async function assertPageInWorkspace(workspaceId: string, pageId: string): Promise<void> {
  const page = await PageModel.findOne({ _id: pageId, workspaceId }).select('_id').lean();
  if (!page) throw new HttpError(404, 'PageNotFound');
}

/**
 * Loads a comment scoped to the workspace and resolves the caller's
 * permission on its page. Item-level routes (edit / delete / resolve) carry
 * no page id in the URL, so authorisation is enforced here instead of the
 * router-level `pageAccessGuard`.
 */
async function loadCommentForActor(
  workspaceId: string,
  actor: CommentActor,
  commentId: string,
  required: PageLevel,
): Promise<{ comment: any; level: PageLevel }> {
  if (!isValidObjectId(commentId)) throw new HttpError(404, 'CommentNotFound');
  const comment = await CommentModel.findOne({ _id: commentId, workspaceId });
  if (!comment) throw new HttpError(404, 'CommentNotFound');
  const level = await pagePermissionsService.resolve(
    workspaceId,
    actor.userId,
    String(comment.pageId),
    actor.role,
    new PermissionCache(),
  );
  if (!levelAtLeast(level, required)) throw new HttpError(403, 'Forbidden');
  return { comment, level };
}

/** Hydrate author display info for a batch of comments in one query. */
async function attachAuthors(comments: any[]): Promise<Map<string, AuthorLite>> {
  const ids = [...new Set(comments.map((c) => String(c.authorId)))];
  if (!ids.length) return new Map();
  const users = await UserModel.find({ _id: { $in: ids } })
    .select('_id name avatarUrl')
    .lean();
  const map = new Map<string, AuthorLite>();
  for (const u of users) {
    map.set(String(u._id), {
      id: String(u._id),
      name: (u as any).name || 'Unknown',
      avatarUrl: (u as any).avatarUrl ?? null,
    });
  }
  return map;
}

export const commentsService = {
  /** Every non-deleted-root thread + replies for a page, oldest-first. */
  async listByPage(
    workspaceId: string,
    pageId: string,
    viewerId: string | null = null,
  ): Promise<CommentDTO[]> {
    await assertPageInWorkspace(workspaceId, pageId);
    const comments = await CommentModel.find({ workspaceId, pageId })
      .sort({ createdAt: 1 })
      .lean();
    const authors = await attachAuthors(comments);
    return comments.map((c) => toDTO(c, authors.get(String(c.authorId)) ?? null, viewerId));
  },

  async create(
    workspaceId: string,
    pageId: string,
    actor: CommentActor,
    input: CreateCommentInput,
  ): Promise<CommentDTO> {
    await assertPageInWorkspace(workspaceId, pageId);

    let blockId = input.blockId ?? null;
    let parentObjId: Types.ObjectId | null = null;
    let rootAuthorId: string | null = null;
    // Only thread roots carry a quote; replies never do.
    let quote = input.quote ?? null;

    // Replies inherit their root thread's anchor block so the whole thread
    // groups under one block in the UI.
    if (input.parentId) {
      if (!isValidObjectId(input.parentId)) throw new HttpError(404, 'ParentNotFound');
      const parent = await CommentModel.findOne({
        _id: input.parentId,
        workspaceId,
        pageId,
      }).lean();
      if (!parent) throw new HttpError(404, 'ParentNotFound');
      // Only one level of nesting: a reply's parent must be a root comment.
      if ((parent as any).parentId) throw new HttpError(400, 'CannotReplyToReply');
      parentObjId = new Types.ObjectId(input.parentId);
      blockId = (parent as any).blockId ?? null;
      rootAuthorId = String((parent as any).authorId);
      quote = null;
    }

    const created = await CommentModel.create({
      workspaceId: new Types.ObjectId(workspaceId),
      pageId: new Types.ObjectId(pageId),
      blockId,
      quote,
      parentId: parentObjId,
      authorId: new Types.ObjectId(actor.userId),
      body: input.body,
      resolved: false,
    });

    // Replying re-opens a resolved thread (matches Notion).
    if (parentObjId) {
      await CommentModel.updateOne({ _id: parentObjId }, { $set: { resolved: false } });
    }

    await this.dispatchNotifications(workspaceId, pageId, actor, created, input, rootAuthorId);

    notifyCommentsChanged(pageId);
    const authors = await attachAuthors([created]);
    return toDTO(created, authors.get(String(created.authorId)) ?? null, actor.userId);
  },

  /**
   * Fan out notifications for a freshly created comment:
   *  - `comment_mention` to each @-mentioned member (validated against the
   *    workspace roster, self excluded);
   *  - `comment_reply` to the root thread author when this is a reply, unless
   *    they were already mentioned or are the actor.
   * Fire-and-forget: notification failures never block comment creation.
   */
  async dispatchNotifications(
    workspaceId: string,
    pageId: string,
    actor: CommentActor,
    created: any,
    input: CreateCommentInput,
    rootAuthorId: string | null,
  ): Promise<void> {
    try {
      const preview = previewOf(input.body);
      const commentId = String(created._id);
      const blockId = created.blockId ?? null;
      const recipients = new Set<string>();
      const jobs: CreateNotificationInput[] = [];

      const mentionIds = [...new Set((input.mentions ?? []).filter(isValidObjectId))];
      if (mentionIds.length) {
        // Only notify ids that are genuine members of this workspace.
        const members = await MembershipModel.find({
          workspaceId,
          userId: { $in: mentionIds },
        })
          .select('userId')
          .lean();
        for (const m of members) {
          const uid = String((m as any).userId);
          if (uid === actor.userId || recipients.has(uid)) continue;
          recipients.add(uid);
          jobs.push({
            workspaceId,
            userId: uid,
            actorId: actor.userId,
            type: 'comment_mention',
            pageId,
            commentId,
            blockId,
            preview,
          });
        }
      }

      if (rootAuthorId && rootAuthorId !== actor.userId && !recipients.has(rootAuthorId)) {
        jobs.push({
          workspaceId,
          userId: rootAuthorId,
          actorId: actor.userId,
          type: 'comment_reply',
          pageId,
          commentId,
          blockId,
          preview,
        });
      }

      if (jobs.length) await notificationsService.createMany(jobs);
    } catch {
      // Best-effort: never fail a comment because a notification could not be written.
    }
  },


  async update(
    workspaceId: string,
    actor: CommentActor,
    commentId: string,
    input: UpdateCommentInput,
  ): Promise<CommentDTO> {
    const { comment } = await loadCommentForActor(workspaceId, actor, commentId, 'comment');
    if (comment.deletedAt) throw new HttpError(400, 'CommentDeleted');
    // Only the author may edit their own message.
    if (String(comment.authorId) !== actor.userId) throw new HttpError(403, 'Forbidden');
    comment.body = input.body;
    await comment.save();
    notifyCommentsChanged(String(comment.pageId));
    const authors = await attachAuthors([comment]);
    return toDTO(comment, authors.get(String(comment.authorId)) ?? null, actor.userId);
  },

  /** Soft-delete. Author can always delete; `full` page access can moderate. */
  async remove(
    workspaceId: string,
    actor: CommentActor,
    commentId: string,
  ): Promise<{ ok: true }> {
    const { comment, level } = await loadCommentForActor(workspaceId, actor, commentId, 'comment');
    const isAuthor = String(comment.authorId) === actor.userId;
    if (!isAuthor && !levelAtLeast(level, 'full')) throw new HttpError(403, 'Forbidden');
    if (!comment.deletedAt) {
      comment.deletedAt = new Date();
      comment.body = '';
      await comment.save();
      notifyCommentsChanged(String(comment.pageId));
    }
    return { ok: true };
  },

  /**
   * Toggle a thread's resolved state. Resolution lives on the root comment;
   * resolving a reply resolves its root. Requires `comment` access.
   */
  async setResolved(
    workspaceId: string,
    actor: CommentActor,
    commentId: string,
    resolved: boolean,
  ): Promise<CommentDTO> {
    const { comment } = await loadCommentForActor(workspaceId, actor, commentId, 'comment');
    const rootId = comment.parentId ?? comment._id;
    const root = comment.parentId
      ? await CommentModel.findOne({ _id: rootId, workspaceId })
      : comment;
    if (!root) throw new HttpError(404, 'CommentNotFound');
    root.resolved = resolved;
    await root.save();
    notifyCommentsChanged(String(root.pageId));
    const authors = await attachAuthors([root]);
    return toDTO(root, authors.get(String(root.authorId)) ?? null, actor.userId);
  },

  /**
   * Toggle one emoji reaction by the caller on a comment. Adds it if absent,
   * removes it if already present (per user+emoji). Requires `comment` access.
   * Deleted comments cannot be reacted to.
   */
  async toggleReaction(
    workspaceId: string,
    actor: CommentActor,
    commentId: string,
    emoji: string,
  ): Promise<CommentDTO> {
    const { comment } = await loadCommentForActor(workspaceId, actor, commentId, 'comment');
    if (comment.deletedAt) throw new HttpError(400, 'CommentDeleted');

    const uid = actor.userId;
    const existing = (comment.reactions ?? []).findIndex(
      (r: any) => r.emoji === emoji && String(r.userId) === uid,
    );
    if (existing >= 0) {
      comment.reactions.splice(existing, 1);
    } else {
      comment.reactions.push({ emoji, userId: new Types.ObjectId(uid) } as any);
    }
    await comment.save();
    notifyCommentsChanged(String(comment.pageId));
    const authors = await attachAuthors([comment]);
    return toDTO(comment, authors.get(String(comment.authorId)) ?? null, uid);
  },
};
