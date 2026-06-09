import { useEffect, useState } from 'react';
import {
  selectActiveWorkspace,
  useWorkspaceStore,
} from '@/stores/workspace.store';
import { GeneralPanel } from './settings/GeneralPanel';
import { MembersPanel } from './settings/MembersPanel';
import { InvitationsPanel } from './settings/InvitationsPanel';

type Tab = 'general' | 'members' | 'invitations';

const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'general', label: 'General' },
  { key: 'members', label: 'Members' },
  { key: 'invitations', label: 'Invitations' },
];

/**
 * Workspace settings page (route: /settings/workspace).
 *
 * Renders panel for the active workspace only. Tab state lives in URL hash
 * (#members) so links from email and admin tools can deep-link without
 * needing a separate route per tab.
 */
export function WorkspaceSettingsPage(): JSX.Element {
  const fetch = useWorkspaceStore((s) => s.fetch);
  const loaded = useWorkspaceStore((s) => s.loaded);
  const ws = useWorkspaceStore(selectActiveWorkspace);

  const [tab, setTab] = useState<Tab>(() => readTabFromHash());

  useEffect(() => {
    if (!loaded) void fetch();
  }, [loaded, fetch]);

  useEffect(() => {
    const onHash = () => setTab(readTabFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const handleTab = (next: Tab) => {
    history.replaceState(null, '', `#${next}`);
    setTab(next);
  };

  if (!ws) {
    return <div className="p-8 text-zinc-500">Loading workspace…</div>;
  }

  const canAdmin = ws.role === 'owner' || ws.role === 'admin';

  return (
    <div className="mx-auto max-w-3xl p-8">
      <div className="mb-6">
        <div className="text-xs uppercase tracking-wider text-zinc-500">Workspace</div>
        <div className="flex items-center gap-3">
          <span className="text-3xl">{ws.iconEmoji}</span>
          <h1 className="text-2xl font-semibold">{ws.name}</h1>
        </div>
      </div>

      <div className="mb-6 flex gap-1 border-b border-zinc-200 dark:border-zinc-800">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => handleTab(t.key)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${
              tab === t.key
                ? 'border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100'
                : 'border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'general' && <GeneralPanel ws={ws} canAdmin={canAdmin} />}
      {tab === 'members' && <MembersPanel ws={ws} canAdmin={canAdmin} />}
      {tab === 'invitations' && <InvitationsPanel ws={ws} canAdmin={canAdmin} />}
    </div>
  );
}

function readTabFromHash(): Tab {
  const h = (typeof window !== 'undefined' ? window.location.hash : '').replace('#', '');
  if (h === 'members' || h === 'invitations') return h;
  return 'general';
}
