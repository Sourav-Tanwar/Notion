import { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { selectAuthStatus, useAuthStore } from '@/stores/auth.store';
import { usePagesStore } from '@/stores/pages.store';
import { Sidebar } from '@/features/sidebar/Sidebar';
import { VerificationBanner } from '@/features/auth/VerificationBanner';
import { QuickSwitcher } from '@/features/quickswitcher/QuickSwitcher';
import { useHotkey } from '@/hooks/useHotkey';
import { cn } from '@/lib/cn';
import { initThemeManager } from '@/theme/manager';

// Code-split editor + auth pages.
const Editor = lazy(() => import('@/features/editor/Editor').then((m) => ({ default: m.Editor })));
const AuthPage = lazy(() => import('@/features/auth/AuthPage').then((m) => ({ default: m.AuthPage })));
const ForgotPasswordPage = lazy(() => import('@/features/auth/ForgotPasswordPage').then((m) => ({ default: m.ForgotPasswordPage })));
const ResetPasswordPage = lazy(() => import('@/features/auth/ResetPasswordPage').then((m) => ({ default: m.ResetPasswordPage })));
const SetPasswordPage = lazy(() => import('@/features/auth/SetPasswordPage').then((m) => ({ default: m.SetPasswordPage })));
const VerifyEmailPage = lazy(() => import('@/features/auth/VerifyEmailPage').then((m) => ({ default: m.VerifyEmailPage })));
const OAuthCallbackPage = lazy(() => import('@/features/auth/OAuthCallbackPage').then((m) => ({ default: m.OAuthCallbackPage })));
const AccountSettingsPage = lazy(() => import('@/features/auth/AccountSettingsPage').then((m) => ({ default: m.AccountSettingsPage })));
const CheckEmailPage = lazy(() => import('@/features/auth/CheckEmailPage').then((m) => ({ default: m.CheckEmailPage })));
const SessionsPage = lazy(() => import('@/features/auth/SessionsPage').then((m) => ({ default: m.SessionsPage })));
const TrashPage = lazy(() => import('@/features/trash/TrashPage').then((m) => ({ default: m.TrashPage })));
const WorkspaceSettingsPage = lazy(() =>
  import('@/features/workspace/WorkspaceSettingsPage').then((m) => ({ default: m.WorkspaceSettingsPage })),
);
const AcceptInvitationPage = lazy(() =>
  import('@/features/auth/AcceptInvitationPage').then((m) => ({ default: m.AcceptInvitationPage })),
);
const PublicSharePage = lazy(() =>
  import('@/features/public/PublicSharePage').then((m) => ({ default: m.PublicSharePage })),
);
const LandingPage = lazy(() =>
  import('@/features/landing/LandingPage').then((m) => ({ default: m.LandingPage })),
);

function PrivateShell(): JSX.Element {
  const status = useAuthStore(selectAuthStatus);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  useHotkey('mod+k', () => setSwitcherOpen((v) => !v));

  // Close the mobile drawer whenever the route changes (e.g. after picking a
  // page). No-op on desktop where the sidebar is always docked.
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  if (status === 'idle' || status === 'hydrating') {
    return <div className="flex h-full items-center justify-center text-zinc-500">Loading…</div>;
  }
  // Unauthenticated visitors get the public landing page at the root, but any
  // deeper private route bounces to the login screen.
  if (status !== 'authed') {
    return location.pathname === '/' ? <LandingPage /> : <Navigate to="/login" replace />;
  }
  return (
    <div className="flex h-full">
      {/* Mobile-only scrim behind the drawer. */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden
        />
      )}
      <div
        className={cn(
          'fixed inset-y-0 left-0 z-50 transition-transform md:static md:z-auto md:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
        )}
      >
        <Sidebar />
      </div>
      <main className="flex min-w-0 flex-1 flex-col overflow-auto">
        {/* Mobile top bar with hamburger; hidden on md+ where the sidebar docks. */}
        <div className="flex items-center gap-2 border-b border-border px-3 py-2 md:hidden">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
            className="rounded p-1 text-lg text-zinc-600 hover:bg-zinc-200/60 dark:text-zinc-300 dark:hover:bg-zinc-800/60"
          >
            ☰
          </button>
        </div>
        <VerificationBanner />
        <Suspense fallback={<div className="p-8 text-zinc-500">Loading…</div>}>
          <Routes>
            <Route path="/" element={<HomeRedirect />} />
            <Route path="/p/:pageId" element={<EditorRoute />} />
            <Route path="/trash" element={<TrashPage />} />
            <Route path="/settings/account" element={<AccountSettingsPage />} />
            <Route path="/settings/sessions" element={<SessionsPage />} />
            <Route path="/settings/workspace" element={<WorkspaceSettingsPage />} />
            <Route path="/invitations/:token" element={<AcceptInvitationPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </main>
      <QuickSwitcher open={switcherOpen} onClose={() => setSwitcherOpen(false)} />
    </div>
  );
}

function EditorRoute(): JSX.Element {
  const { pageId } = useParams();
  if (!pageId) return <Navigate to="/" replace />;
  return <Editor pageId={pageId} />;
}

function HomeRedirect(): JSX.Element {
  const rootIds = usePagesStore((s) => s.rootIds);
  const loaded = usePagesStore((s) => s.loaded);
  if (!loaded) return <div className="p-8 text-zinc-500">Loading…</div>;
  if (!rootIds.length) {
    return <div className="p-8 text-zinc-400">Create a page from the sidebar to get started.</div>;
  }
  return <Navigate to={`/p/${rootIds[0]}`} replace />;
}

export function App(): JSX.Element {
  const hydrate = useAuthStore((s) => s.hydrate);
  useEffect(() => { void hydrate(); }, [hydrate]);
  // Initialize the theme manager once for the lifetime of the app. It is
  // idempotent, so HMR re-mounts during dev don't double-wire listeners.
  useEffect(() => {
    const dispose = initThemeManager();
    return () => dispose();
  }, []);

  return (
    <BrowserRouter>
      <Suspense fallback={<div className="p-8 text-zinc-500">Loading…</div>}>
        <Routes>
          <Route path="/login" element={<AuthPage mode="login" />} />
          <Route path="/signup" element={<AuthPage mode="signup" />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/set-password" element={<SetPasswordPage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/check-email" element={<CheckEmailPage />} />
          <Route path="/oauth/callback" element={<OAuthCallbackPage />} />
          <Route path="/share/:token" element={<PublicSharePage />} />
          <Route path="/*" element={<PrivateShell />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
