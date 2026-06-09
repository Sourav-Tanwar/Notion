import { useEffect, useState } from 'react';
import {
  pagePermissionsApi,
  type GrantableLevel,
  type PagePermissionDTO,
} from '@/services/pagePermissions.api';
import {
  shareLinksApi,
  type CreatedShareLinkDTO,
  type ShareLinkDTO,
} from '@/services/shareLinks.api';
import { Avatar } from '@/components/Avatar';

const GRANTABLE: GrantableLevel[] = ['view', 'comment', 'edit', 'full'];

interface Props {
  pageId: string;
  onClose: () => void;
}

/**
 * Page sharing modal.
 *
 * Two sections:
 *   1. People — list explicit grants on this page; add by email; change level;
 *      remove. The candidate lookup uses the workspace membership index, so
 *      adding a non-member returns a clear "Not in workspace" hint instead of
 *      silently failing.
 *   2. Public link — at most one *active* link is shown at a time (the most
 *      recent). Old links can be revoked from the workspace settings if
 *      needed. Raw token is shown ONCE on creation, copyable.
 *
 * Both sections are independent fetches so a slow public-link query doesn't
 * block the People list from rendering.
 */
export function SharingModal({ pageId, onClose }: Props): JSX.Element {
  // --- People ---
  const [grants, setGrants] = useState<PagePermissionDTO[] | null>(null);
  const [grantError, setGrantError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [level, setLevel] = useState<GrantableLevel>('view');
  const [lookupNote, setLookupNote] = useState<string | null>(null);

  // --- Public link ---
  const [links, setLinks] = useState<ShareLinkDTO[] | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [createdToken, setCreatedToken] = useState<string | null>(null);

  const reloadGrants = async () => {
    try {
      setGrants(await pagePermissionsApi.list(pageId));
    } catch (e) {
      setGrantError(e instanceof Error ? e.message : 'Failed to load permissions');
    }
  };

  const reloadLinks = async () => {
    try {
      setLinks(await shareLinksApi.list(pageId));
    } catch (e) {
      setLinkError(e instanceof Error ? e.message : 'Failed to load share links');
    }
  };

  useEffect(() => {
    void reloadGrants();
    void reloadLinks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const addGrant = async (e: React.FormEvent) => {
    e.preventDefault();
    setLookupNote(null);
    const q = email.trim().toLowerCase();
    if (!q) return;
    setBusy('add');
    try {
      const candidate = await pagePermissionsApi.findCandidate(pageId, q);
      if (!candidate) {
        setLookupNote('Not a workspace member yet. Invite them from Workspace settings.');
        return;
      }
      await pagePermissionsApi.upsert(pageId, { userId: candidate.userId, level });
      setEmail('');
      await reloadGrants();
    } catch (err) {
      setLookupNote(err instanceof Error ? err.message : 'Failed to share');
    } finally {
      setBusy(null);
    }
  };

  const changeLevel = async (userId: string, next: GrantableLevel) => {
    setBusy(userId);
    try {
      await pagePermissionsApi.upsert(pageId, { userId, level: next });
      await reloadGrants();
    } finally {
      setBusy(null);
    }
  };

  const removeGrant = async (userId: string) => {
    setBusy(userId);
    try {
      await pagePermissionsApi.remove(pageId, userId);
      await reloadGrants();
    } finally {
      setBusy(null);
    }
  };

  const activeLink = links?.find((l) => !l.revokedAt) ?? null;

  const createLink = async () => {
    setBusy('link');
    try {
      const created: CreatedShareLinkDTO = await shareLinksApi.create(pageId, {});
      setCreatedToken(created.token);
      await reloadLinks();
    } finally {
      setBusy(null);
    }
  };

  const revokeLink = async (linkId: string) => {
    if (!confirm('Revoke this public link?')) return;
    setBusy(linkId);
    try {
      await shareLinksApi.revoke(pageId, linkId);
      setCreatedToken(null);
      await reloadLinks();
    } finally {
      setBusy(null);
    }
  };

  const copy = (text: string) => {
    void navigator.clipboard.writeText(text).catch(() => undefined);
  };

  const shareUrl = (token: string) => `${window.location.origin}/share/${token}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-6"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-lg bg-white p-5 shadow-xl dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">Share page</h2>
          <button
            onClick={onClose}
            className="rounded px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            Close
          </button>
        </div>

        {/* People */}
        <section className="mb-6">
          <form onSubmit={addGrant} className="flex gap-2">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Add people by email"
              className="flex-1 rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800"
            />
            <select
              value={level}
              onChange={(e) => setLevel(e.target.value as GrantableLevel)}
              className="rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800"
            >
              {GRANTABLE.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={busy === 'add'}
              className="rounded bg-zinc-900 px-3 py-1.5 text-sm text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
            >
              Share
            </button>
          </form>
          {lookupNote && (
            <div className="mt-2 text-xs text-amber-600 dark:text-amber-400">{lookupNote}</div>
          )}
          {grantError && (
            <div className="mt-2 text-xs text-red-500">{grantError}</div>
          )}

          {grants && grants.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {grants.map((g) => (
                <li key={g.id} className="flex items-center gap-2">
                  <Avatar user={g.user} size={7} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm">{g.user?.name || g.user?.email || '—'}</div>
                    <div className="truncate text-xs text-zinc-500">{g.user?.email}</div>
                  </div>
                  <select
                    value={g.level}
                    disabled={busy === g.userId}
                    onChange={(e) =>
                      void changeLevel(g.userId, e.target.value as GrantableLevel)
                    }
                    className="rounded border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-800"
                  >
                    {GRANTABLE.map((l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => void removeGrant(g.userId)}
                    disabled={busy === g.userId}
                    className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50 dark:hover:bg-red-950/30"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Public link */}
        <section>
          <h3 className="mb-2 text-sm font-semibold">Public link</h3>
          {linkError && <div className="text-xs text-red-500">{linkError}</div>}
          {activeLink ? (
            <div className="space-y-2">
              {createdToken && (
                <div className="rounded border border-emerald-300 bg-emerald-50 p-2 text-xs dark:border-emerald-900/50 dark:bg-emerald-950/30">
                  <div className="mb-1 font-medium text-emerald-700 dark:text-emerald-300">
                    Copy the URL — it won't be shown again:
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 truncate rounded bg-white px-2 py-1 text-[11px] dark:bg-zinc-800">
                      {shareUrl(createdToken)}
                    </code>
                    <button
                      onClick={() => copy(shareUrl(createdToken))}
                      className="rounded bg-emerald-600 px-2 py-1 text-[11px] text-white"
                    >
                      Copy
                    </button>
                  </div>
                </div>
              )}
              <div className="flex items-center justify-between rounded border border-zinc-200 px-3 py-2 text-xs dark:border-zinc-700">
                <span className="text-zinc-500">
                  Active link · created {new Date(activeLink.createdAt).toLocaleDateString()}
                  {activeLink.hasPassword && ' · password-protected'}
                  {activeLink.expiresAt &&
                    ` · expires ${new Date(activeLink.expiresAt).toLocaleDateString()}`}
                </span>
                <button
                  onClick={() => void revokeLink(activeLink.id)}
                  disabled={busy === activeLink.id}
                  className="rounded px-2 py-1 text-red-600 hover:bg-red-50 disabled:opacity-50 dark:hover:bg-red-950/30"
                >
                  Revoke
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={createLink}
              disabled={busy === 'link'}
              className="rounded border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              {busy === 'link' ? 'Creating…' : 'Create public link'}
            </button>
          )}
        </section>
      </div>
    </div>
  );
}
