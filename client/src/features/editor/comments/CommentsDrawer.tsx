/**
 * Comments drawer — right-side panel listing every thread on the page.
 *
 * Threads (root comment + one level of replies) are grouped under an Open /
 * Resolved filter. Each thread supports reply, resolve/reopen, and delete
 * (author or `full` page access — the server is the real gate; we only hide
 * affordances we know will 403). A composer at the bottom posts either a
 * page-level comment or, when opened from a block bubble, a comment anchored
 * to that block (`composeBlockId`).
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Avatar } from '@/components/Avatar';
import { useAuthStore } from '@/stores/auth.store';
import { selectBlock, useBlocksStore } from '@/stores/blocks.store';
import {
  selectThreads,
  useCommentsStore,
  useCommentsUiStore,
  type CommentThread,
} from '@/stores/comments.store';
import { applyCommentMarkTo } from '../collab/marks';
import { type Comment, type ReactionEmoji, REACTION_EMOJIS } from '@/services/comments.api';
import { workspacesApi } from '@/services/workspaces.api';
import { getActiveWorkspaceId } from '@/services/activeWorkspace';
import type { ID } from '@/types/domain';

/** A workspace member the composer can offer as an @-mention target. */
interface MentionOption {
  id: string;
  name: string;
  avatarUrl: string | null;
}

/**
 * Fetch the active workspace's members once for mention autocomplete.
 * Shared by every Composer in the drawer; excludes members without a user
 * record or a usable name.
 */
function useMentionMembers(): MentionOption[] {
  const [members, setMembers] = useState<MentionOption[]>([]);
  useEffect(() => {
    const wsId = getActiveWorkspaceId();
    if (!wsId) return;
    let alive = true;
    void workspacesApi
      .listMembers(wsId)
      .then((list) => {
        if (!alive) return;
        setMembers(
          list
            .filter((m) => m.user && m.user.name)
            .map((m) => ({
              id: m.user!.id,
              name: m.user!.name,
              avatarUrl: m.user!.avatarUrl,
            })),
        );
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  return members;
}

interface Props {
  pageId: ID;
  onClose: () => void;
  /** When set, the composer is pre-anchored to this block. */
  composeBlockId?: ID | null;
}

export function CommentsDrawer({ pageId, onClose, composeBlockId = null }: Props): JSX.Element {
  const threads = useCommentsStore(useShallow(selectThreads(pageId)));
  const add = useCommentsStore((s) => s.add);
  const addThread = useCommentsStore((s) => s.addThread);
  const pendingSelection = useCommentsUiStore((s) => s.pendingSelection);
  const clearPendingSelection = useCommentsUiStore((s) => s.clearPendingSelection);
  const members = useMentionMembers();
  const [tab, setTab] = useState<'open' | 'resolved'>('open');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const visible = useMemo(
    () =>
      threads.filter((t) =>
        tab === 'open' ? !t.root.resolved && !t.root.deleted : t.root.resolved,
      ),
    [threads, tab],
  );

  // Deep-link focus: a notification (or block ref) can request a specific
  // comment. Switch to the tab that contains its thread, then scroll it into
  // view and flash it once. Cleared after handling so it fires only once.
  const focusCommentId = useCommentsUiStore((s) => s.focusCommentId);
  const clearFocus = useCommentsUiStore((s) => s.clearFocus);
  useEffect(() => {
    if (!focusCommentId) return;
    const target = threads.find(
      (t) =>
        t.root.id === focusCommentId ||
        t.replies.some((r) => r.id === focusCommentId),
    );
    if (!target) return; // threads may not be loaded yet; retry on next render
    if (target.root.resolved && tab !== 'resolved') setTab('resolved');
    if (!target.root.resolved && tab !== 'open') setTab('open');

    const id = window.setTimeout(() => {
      const el = document.querySelector<HTMLElement>(
        `[data-thread-id="${cssEscape(target.root.id)}"]`,
      );
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.style.transition = 'box-shadow 0.2s ease, background-color 0.2s ease';
        el.style.boxShadow = '0 0 0 2px rgb(245 158 11 / 0.9)';
        window.setTimeout(() => {
          el.style.boxShadow = '';
        }, 1600);
      }
      clearFocus();
    }, 60);
    return () => window.clearTimeout(id);
  }, [focusCommentId, threads, tab, clearFocus]);

  const submit = async (): Promise<void> => {
    const text = body.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      // A pending selection means this is a text-anchored thread: create it,
      // then stamp the `comment` mark over the captured range with the new id.
      if (pendingSelection) {
        const created = await addThread(pageId, {
          blockId: pendingSelection.blockId,
          parentId: null,
          body: text,
          mentions: mentionIdsIn(text, members),
          quote: pendingSelection.quote,
        });
        applyCommentMarkTo(
          pendingSelection.blockId,
          pendingSelection.from,
          pendingSelection.to,
          created.id,
        );
        clearPendingSelection();
      } else {
        await add(pageId, {
          blockId: composeBlockId,
          parentId: null,
          body: text,
          mentions: mentionIdsIn(text, members),
        });
      }
      setBody('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-[90] bg-black/20"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className="fixed right-0 top-0 z-[91] flex h-full w-[360px] max-w-[90vw] flex-col border-l border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-900"
        aria-label="Comments"
      >
        <header className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Comments</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close comments"
            className="rounded p-1 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            ✕
          </button>
        </header>

        <div className="flex gap-1 border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">
          {(['open', 'resolved'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={
                'rounded px-2.5 py-1 text-xs font-medium capitalize ' +
                (tab === t
                  ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                  : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800')
              }
            >
              {t}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3">
          {visible.length === 0 ? (
            <p className="px-1 py-6 text-center text-xs text-zinc-400">
              {tab === 'open' ? 'No open comments yet.' : 'No resolved comments.'}
            </p>
          ) : (
            <ul className="space-y-3">
              {visible.map((thread) => (
                <ThreadCard key={thread.root.id} pageId={pageId} thread={thread} />
              ))}
            </ul>
          )}
        </div>

        <footer className="border-t border-zinc-200 p-3 dark:border-zinc-800">
          {pendingSelection ? (
            <p className="mb-1 truncate text-[11px] text-zinc-400">
              Commenting on “<span className="text-zinc-500 dark:text-zinc-300">{pendingSelection.quote}</span>”
            </p>
          ) : (
            composeBlockId && (
              <p className="mb-1 text-[11px] text-zinc-400">Commenting on selected block</p>
            )
          )}
          <Composer
            value={body}
            onChange={setBody}
            onSubmit={submit}
            busy={busy}
            placeholder="Add a comment…  (@ to mention)"
            members={members}
          />
        </footer>
      </aside>
    </>
  );
}

function ThreadCard({ pageId, thread }: { pageId: ID; thread: CommentThread }): JSX.Element {
  const setResolved = useCommentsStore((s) => s.setResolved);
  const add = useCommentsStore((s) => s.add);
  const members = useMentionMembers();
  const [replyOpen, setReplyOpen] = useState(false);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);

  const submitReply = async (): Promise<void> => {
    const text = reply.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      await add(pageId, {
        blockId: thread.root.blockId,
        parentId: thread.root.id,
        body: text,
        mentions: mentionIdsIn(text, members),
      });
      setReply('');
      setReplyOpen(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="rounded-lg border border-zinc-200 bg-zinc-50/60 p-2.5 dark:border-zinc-800 dark:bg-zinc-800/40" data-thread-id={thread.root.id}>
      <BlockRef blockId={thread.root.blockId} />
      <CommentRow pageId={pageId} comment={thread.root} members={members} />
      {thread.replies.length > 0 && (
        <ul className="mt-2 space-y-2 border-l border-zinc-200 pl-2.5 dark:border-zinc-700">
          {thread.replies.map((r) => (
            <li key={r.id}>
              <CommentRow pageId={pageId} comment={r} members={members} />
            </li>
          ))}
        </ul>
      )}

      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setReplyOpen((v) => !v)}
          className="text-[11px] font-medium text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
        >
          Reply
        </button>
        <button
          type="button"
          onClick={() => void setResolved(pageId, thread.root.id, !thread.root.resolved)}
          className="text-[11px] font-medium text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
        >
          {thread.root.resolved ? 'Reopen' : 'Resolve'}
        </button>
      </div>

      {replyOpen && (
        <div className="mt-2">
          <Composer
            value={reply}
            onChange={setReply}
            onSubmit={submitReply}
            busy={busy}
            placeholder="Reply…  (@ to mention)"
            members={members}
            autoFocus
          />
        </div>
      )}
    </li>
  );
}

/**
 * Reference chip showing which block a thread is pinned to. Clicking it
 * scrolls the block into view and flashes a highlight so the user can find
 * the source of the comment. Page-level threads (no blockId) render a static
 * "Page comment" label instead.
 */
function BlockRef({ blockId }: { blockId: ID | null }): JSX.Element {
  const block = useBlocksStore(blockId ? selectBlock(blockId) : () => undefined);

  if (!blockId) {
    return (
      <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-zinc-400">
        Page comment
      </p>
    );
  }

  const snippet = block ? plainSnippet(block.text) : '';
  const label = snippet || 'Untitled block';

  const jump = (): void => {
    const el = document.querySelector<HTMLElement>(`[data-block-id="${cssEscape(blockId)}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const prev = el.style.boxShadow;
    el.style.transition = 'box-shadow 0.2s ease';
    el.style.boxShadow = '0 0 0 2px rgb(245 158 11 / 0.9)';
    window.setTimeout(() => {
      el.style.boxShadow = prev;
    }, 1400);
  };

  return (
    <button
      type="button"
      onClick={jump}
      title="Jump to block"
      className="mb-1.5 flex w-full items-center gap-1 truncate rounded border border-zinc-200 bg-white px-1.5 py-0.5 text-left text-[10px] text-zinc-500 hover:border-amber-300 hover:text-amber-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:text-amber-300"
    >
      <span className="shrink-0">↳</span>
      <span className="truncate">{label}</span>
    </button>
  );
}

function CommentRow({
  pageId,
  comment,
  members = [],
}: {
  pageId: ID;
  comment: Comment;
  members?: MentionOption[];
}): JSX.Element {
  const me = useAuthStore((s) => s.user);
  const edit = useCommentsStore((s) => s.edit);
  const remove = useCommentsStore((s) => s.remove);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body);
  const [busy, setBusy] = useState(false);

  const isAuthor = me?.id === comment.authorId;

  if (comment.deleted) {
    return <p className="text-xs italic text-zinc-400">Comment deleted</p>;
  }

  const saveEdit = async (): Promise<void> => {
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      await edit(pageId, comment.id, text);
      setEditing(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-2">
        <Avatar
          user={
            comment.author
              ? { name: comment.author.name, email: '', avatarUrl: comment.author.avatarUrl }
              : null
          }
          size={6}
        />
        <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
          {comment.author?.name ?? 'Unknown'}
        </span>
        <span className="text-[10px] text-zinc-400">{formatRelative(comment.createdAt)}</span>
      </div>
      {editing ? (
        <div className="mt-1">
          <Composer
            value={draft}
            onChange={setDraft}
            onSubmit={saveEdit}
            busy={busy}
            placeholder="Edit comment…"
            autoFocus
          />
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setDraft(comment.body);
            }}
            className="mt-1 text-[11px] text-zinc-400 hover:text-zinc-600"
          >
            Cancel
          </button>
        </div>
      ) : (
        <p className="mt-0.5 whitespace-pre-wrap break-words pl-8 text-xs text-zinc-700 dark:text-zinc-300">
          {renderCommentBody(comment.body, members)}
        </p>
      )}
      {!editing && !comment.deleted && (
        <ReactionBar pageId={pageId} comment={comment} />
      )}
      {isAuthor && !editing && (
        <div className="mt-1 flex gap-2 pl-8">
          <button
            type="button"
            onClick={() => {
              setDraft(comment.body);
              setEditing(true);
            }}
            className="text-[10px] text-zinc-400 hover:text-zinc-600"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => void remove(pageId, comment.id)}
            className="text-[10px] text-red-400 hover:text-red-600"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Emoji reaction row under a comment. Shows a tally per emoji (own reactions
 * highlighted) plus a small picker to add one. Toggling is optimistic and
 * also propagates to peers via the `rev.comments` realtime beacon.
 */
function ReactionBar({ pageId, comment }: { pageId: ID; comment: Comment }): JSX.Element {
  const react = useCommentsStore((s) => s.react);
  const [picking, setPicking] = useState(false);
  const counts = new Map(comment.reactions.map((r) => [r.emoji, r]));

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1 pl-8">
      {comment.reactions.map((r) => (
        <button
          key={r.emoji}
          type="button"
          onClick={() => void react(pageId, comment.id, r.emoji as ReactionEmoji)}
          className={
            'flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] leading-none transition-colors ' +
            (r.mine
              ? 'border-blue-400 bg-blue-500/10 text-blue-600 dark:text-blue-300'
              : 'border-zinc-200 text-zinc-500 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800')
          }
          title={r.mine ? 'Remove your reaction' : 'Add reaction'}
        >
          <span>{r.emoji}</span>
          <span className="tabular-nums">{r.count}</span>
        </button>
      ))}

      <div className="relative">
        <button
          type="button"
          onClick={() => setPicking((v) => !v)}
          className="rounded-full border border-dashed border-zinc-300 px-1.5 py-0.5 text-[11px] leading-none text-zinc-400 hover:bg-zinc-100 dark:border-zinc-600 dark:hover:bg-zinc-800"
          title="Add reaction"
          aria-label="Add reaction"
        >
          +
        </button>
        {picking && (
          <div
            className="absolute bottom-full left-0 z-10 mb-1 flex gap-1 rounded-md border border-zinc-200 bg-white p-1 shadow-md dark:border-zinc-700 dark:bg-zinc-900"
            onMouseLeave={() => setPicking(false)}
          >
            {REACTION_EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => {
                  setPicking(false);
                  void react(pageId, comment.id, e);
                }}
                className={
                  'rounded px-1.5 py-0.5 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 ' +
                  (counts.get(e)?.mine ? 'bg-blue-500/10' : '')
                }
              >
                {e}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Composer({
  value,
  onChange,
  onSubmit,
  busy,
  placeholder,
  autoFocus,
  members = [],
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void | Promise<void>;
  busy: boolean;
  placeholder: string;
  autoFocus?: boolean;
  members?: MentionOption[];
}): JSX.Element {
  const taRef = useRef<HTMLTextAreaElement>(null);
  // Active `@token` being typed at the caret, or null when not mentioning.
  const [mention, setMention] = useState<{ query: string; start: number } | null>(null);
  const [highlight, setHighlight] = useState(0);

  const matches = useMemo(() => {
    if (!mention || !members.length) return [];
    const q = mention.query.toLowerCase();
    return members
      .filter((m) => !q || m.name.toLowerCase().includes(q))
      .slice(0, 6);
  }, [mention, members]);

  // Recompute the active mention token from the caret position.
  const syncMention = (text: string, caret: number): void => {
    if (!members.length) return;
    const upto = text.slice(0, caret);
    const m = /(?:^|\s)@([\p{L}\p{N}_-]*)$/u.exec(upto);
    if (m) {
      setMention({ query: m[1], start: caret - m[1].length - 1 });
      setHighlight(0);
    } else {
      setMention(null);
    }
  };

  const pick = (opt: MentionOption): void => {
    if (!mention) return;
    const ta = taRef.current;
    const caret = ta ? ta.selectionStart : value.length;
    const before = value.slice(0, mention.start);
    const after = value.slice(caret);
    const inserted = `@${opt.name} `;
    const next = before + inserted + after;
    onChange(next);
    setMention(null);
    // Restore caret just after the inserted mention.
    requestAnimationFrame(() => {
      const pos = before.length + inserted.length;
      if (ta) {
        ta.focus();
        ta.setSelectionRange(pos, pos);
      }
    });
  };

  return (
    <div className="relative flex flex-col gap-1.5">
      {mention && matches.length > 0 && (
        <ul className="absolute bottom-full left-0 z-10 mb-1 max-h-48 w-60 overflow-auto rounded-md border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
          {matches.map((m, i) => (
            <li key={m.id}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(m);
                }}
                onMouseEnter={() => setHighlight(i)}
                className={`flex w-full items-center gap-2 px-2 py-1 text-left text-xs ${
                  i === highlight
                    ? 'bg-zinc-100 dark:bg-zinc-800'
                    : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/60'
                }`}
              >
                <Avatar user={{ name: m.name, email: '', avatarUrl: m.avatarUrl }} size={5} />
                <span className="truncate text-zinc-800 dark:text-zinc-200">{m.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <textarea
        ref={taRef}
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          syncMention(e.target.value, e.target.selectionStart);
        }}
        onClick={(e) => syncMention(value, e.currentTarget.selectionStart)}
        onKeyDown={(e) => {
          if (mention && matches.length > 0) {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setHighlight((h) => (h + 1) % matches.length);
              return;
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              setHighlight((h) => (h - 1 + matches.length) % matches.length);
              return;
            }
            if (e.key === 'Enter' || e.key === 'Tab') {
              e.preventDefault();
              pick(matches[highlight]);
              return;
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              setMention(null);
              return;
            }
          }
          // Cmd/Ctrl+Enter submits; plain Enter inserts a newline.
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void onSubmit();
          }
        }}
        rows={2}
        placeholder={placeholder}
        className="w-full resize-none rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-xs text-zinc-900 outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
      />
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-zinc-400">⌘/Ctrl + Enter to send</span>
        <button
          type="button"
          onClick={() => void onSubmit()}
          disabled={busy || !value.trim()}
          className="rounded-md bg-accent px-3 py-1 text-[11px] font-semibold text-white disabled:opacity-40"
        >
          Send
        </button>
      </div>
    </div>
  );
}

/**
 * Resolve which member ids are actually mentioned in the final text. A member
 * counts as mentioned only if the literal `@Name` token still appears, so
 * deleting a mention before sending also drops the notification.
 */
function mentionIdsIn(text: string, members: MentionOption[]): string[] {
  const ids = new Set<string>();
  for (const m of members) {
    if (text.includes(`@${m.name}`)) ids.add(m.id);
  }
  return [...ids];
}

/**
 * Render a plain-text comment body, turning any `@Name` that matches a known
 * member into a styled mention chip. Names are matched longest-first so that
 * "Ann Lee" wins over "Ann". Falls back to raw text when no members are known.
 */
function renderCommentBody(body: string, members: MentionOption[]): ReactNode {
  const names = members
    .map((m) => m.name)
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  if (names.length === 0) return body;

  const pattern = new RegExp(`@(${names.map(escapeRegExp).join('|')})`, 'g');
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(body)) !== null) {
    if (match.index > last) out.push(body.slice(last, match.index));
    out.push(
      <span
        key={`m${key++}`}
        className="rounded bg-blue-500/10 px-1 font-medium text-blue-600 dark:text-blue-400"
      >
        @{match[1]}
      </span>,
    );
    last = match.index + match[0].length;
  }
  if (out.length === 0) return body;
  if (last < body.length) out.push(body.slice(last));
  return out;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Strip inline HTML and collapse whitespace into a short one-line preview. */
function plainSnippet(html: string, max = 60): string {
  const tmp = document.createElement('div');
  tmp.innerHTML = html ?? '';
  const text = (tmp.textContent ?? '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** Escape a block id for safe use inside a CSS attribute selector. */
function cssEscape(value: string): string {
  const cssAny = (window as unknown as { CSS?: { escape?: (s: string) => string } }).CSS;
  if (cssAny?.escape) return cssAny.escape(value);
  return value.replace(/["\\]/g, '\\$&');
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const sec = Math.round((Date.now() - then) / 1000);
  if (sec < 60) return 'just now';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
}
