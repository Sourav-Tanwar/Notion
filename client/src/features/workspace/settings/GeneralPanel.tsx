import { useState } from 'react';
import { useWorkspaceStore } from '@/stores/workspace.store';
import { EmojiPicker } from '@/components/EmojiPicker';
import type { WorkspaceDTO } from '@/services/workspaces.api';

interface Props {
  ws: WorkspaceDTO;
  canAdmin: boolean;
}

export function GeneralPanel({ ws, canAdmin }: Props): JSX.Element {
  const update = useWorkspaceStore((s) => s.update);
  const archive = useWorkspaceStore((s) => s.archive);

  const [name, setName] = useState(ws.name);
  const [emoji, setEmoji] = useState(ws.iconEmoji);
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [emojiOpen, setEmojiOpen] = useState(false);

  const dirty = name !== ws.name || emoji !== ws.iconEmoji;

  const save = async () => {
    setSaving('saving');
    try {
      await update(ws.id, { name: name.trim(), iconEmoji: emoji });
      setSaving('saved');
      setTimeout(() => setSaving('idle'), 1500);
    } catch {
      setSaving('error');
    }
  };

  const handleArchive = async () => {
    if (ws.kind === 'personal') return;
    if (!confirm(`Archive "${ws.name}"? Members will lose access.`)) return;
    await archive(ws.id);
  };

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-3 text-sm font-semibold">Identity</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-zinc-500">Icon</label>
            <div className="relative inline-block">
              <button
                type="button"
                disabled={!canAdmin}
                onClick={() => setEmojiOpen((v) => !v)}
                className="rounded border border-zinc-300 px-3 py-2 text-2xl disabled:opacity-50 dark:border-zinc-700"
              >
                {emoji}
              </button>
              {emojiOpen && (
                <EmojiPicker
                  onSelect={(e) => {
                    setEmoji(e);
                    setEmojiOpen(false);
                  }}
                  onClose={() => setEmojiOpen(false)}
                />
              )}
            </div>
          </div>
          <div>
            <label className="block text-xs text-zinc-500">Name</label>
            <input
              value={name}
              disabled={!canAdmin}
              onChange={(e) => setName(e.target.value)}
              className="w-full max-w-md rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900"
            />
          </div>
          {canAdmin && (
            <div className="flex items-center gap-3">
              <button
                disabled={!dirty || saving === 'saving' || !name.trim()}
                onClick={save}
                className="rounded bg-zinc-900 px-3 py-1.5 text-sm text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
              >
                {saving === 'saving' ? 'Saving…' : 'Save'}
              </button>
              {saving === 'saved' && <span className="text-xs text-emerald-600">Saved</span>}
              {saving === 'error' && <span className="text-xs text-red-500">Save failed</span>}
            </div>
          )}
        </div>
      </section>

      {canAdmin && ws.kind !== 'personal' && (
        <section className="rounded border border-red-200 p-4 dark:border-red-900/50">
          <h2 className="mb-2 text-sm font-semibold text-red-600 dark:text-red-400">
            Danger zone
          </h2>
          <p className="mb-3 text-xs text-zinc-500">
            Archiving the workspace removes it from member sidebars. Pages remain in the
            database; restore is a manual ops action.
          </p>
          <button
            onClick={handleArchive}
            className="rounded border border-red-500 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
          >
            Archive workspace
          </button>
        </section>
      )}
    </div>
  );
}
