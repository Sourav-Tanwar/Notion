import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuthStore } from '@/stores/auth.store';
import { changePasswordSchema, profileSchema, type ChangePasswordInput, type ProfileInput } from './schemas';
import { Field, FormError, SubmitButton, TextArea, TextInput } from './components/Field';
import { AvatarUploader } from './components/AvatarUploader';
import { DangerZone } from './DangerZone';
import { ApiError } from '@/services/http';
import { ThemeSegmented } from '@/theme/ThemeSegmented';

export function AccountSettingsPage(): JSX.Element {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const logoutAll = useAuthStore((s) => s.logoutAll);
  const navigate = useNavigate();

  if (!user) return <div className="p-8 text-zinc-500">Loading…</div>;

  return (
    <div className="mx-auto max-w-2xl space-y-10 px-6 py-12">
      <header>
        <h1 className="text-2xl font-bold">Account settings</h1>
        <p className="text-sm text-zinc-500">Manage your profile, security, and preferences.</p>
      </header>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">Profile</h2>
        <AvatarUploader />
        <ProfileForm />
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">Appearance</h2>
        <div className="rounded border border-border bg-canvas px-4 py-4">
          <div className="mb-1 text-sm font-medium">Theme</div>
          <p className="mb-3 text-xs text-zinc-500">
            Choose how the app looks. System matches your device automatically.
          </p>
          <ThemeSegmented showEffective />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">Email</h2>
        <EmailVerificationCard />
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">Security</h2>
        {user.hasPassword ? (
          <PasswordForm onChanged={() => navigate('/login', { replace: true })} />
        ) : (
          <SetPasswordCard />
        )}
        <div className="flex flex-wrap gap-2 pt-2 text-xs">
          <Link
            to="/settings/sessions"
            className="rounded border border-border bg-canvas px-3 py-1 text-zinc-300 hover:bg-zinc-800"
          >
            Active sessions
          </Link>
          <button onClick={() => void logout()} className="rounded border border-border bg-canvas px-3 py-1 text-zinc-300 hover:bg-zinc-800">
            Log out
          </button>
          <button onClick={() => void logoutAll()} className="rounded border border-red-500/30 bg-red-500/10 px-3 py-1 text-red-300 hover:bg-red-500/20">
            Log out of all devices
          </button>
        </div>
      </section>

      <DangerZone />
    </div>
  );
}

function EmailVerificationCard(): JSX.Element {
  const user = useAuthStore((s) => s.user)!;
  const resend = useAuthStore((s) => s.resendVerification);
  const resendAt = useAuthStore((s) => s.verifyResendAt);
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!resendAt || resendAt <= now) return;
    const id = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(id);
  }, [resendAt, now]);

  if (user.emailVerified) {
    return (
      <div className="rounded border border-border bg-canvas px-3 py-3 text-sm text-zinc-400">
        <span className="text-green-400">✓</span> {user.email} is verified.
      </div>
    );
  }

  const remaining = resendAt ? Math.max(0, Math.ceil((resendAt - now) / 1000)) : 0;
  const onCooldown = remaining > 0;

  async function onResend() {
    setStatus('sending');
    setError(null);
    try {
      await resend();
      setStatus('sent');
    } catch (e) {
      setStatus('error');
      setError(e instanceof ApiError ? e.message : (e as Error).message);
    }
  }

  return (
    <div className="space-y-2 rounded border border-amber-500/30 bg-amber-500/5 px-3 py-3 text-sm">
      <p className="text-amber-200">
        Your email <strong>{user.email}</strong> is not yet verified.
      </p>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void onResend()}
          disabled={onCooldown || status === 'sending'}
          className="rounded border border-amber-500/40 bg-canvas px-3 py-1 text-xs text-amber-200 hover:bg-amber-500/10 disabled:opacity-50"
        >
          {onCooldown ? `Resend in ${remaining}s` : status === 'sending' ? 'Sending…' : 'Send verification email'}
        </button>
        {status === 'sent' && <span className="text-xs text-green-400">Sent.</span>}
        {status === 'error' && error && <span className="text-xs text-red-400">{error}</span>}
      </div>
    </div>
  );
}

function SetPasswordCard(): JSX.Element {
  const requestSetup = useAuthStore((s) => s.requestPasswordSetup);
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setStatus('sending');
    setError(null);
    try {
      await requestSetup();
      setStatus('sent');
    } catch (e) {
      setStatus('error');
      setError(e instanceof ApiError ? e.message : (e as Error).message);
    }
  }

  return (
    <div className="space-y-2 rounded border border-border bg-canvas px-3 py-3 text-sm">
      <p className="text-zinc-300">
        You signed in with a social provider. Add a password to enable email + password sign-in
        as a fallback.
      </p>
      <button
        type="button"
        onClick={() => void onClick()}
        disabled={status === 'sending' || status === 'sent'}
        className="rounded border border-border px-3 py-1 text-xs hover:bg-zinc-800 disabled:opacity-50"
      >
        {status === 'sending' ? 'Sending…' : status === 'sent' ? 'Check your inbox' : 'Send setup link'}
      </button>
      {status === 'sent' && (
        <p className="text-xs text-zinc-500">We emailed you a one-time link. It expires in 60 minutes.</p>
      )}
      {status === 'error' && error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

function ProfileForm(): JSX.Element {
  const user = useAuthStore((s) => s.user)!;
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const form = useForm<ProfileInput>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: user.name, username: user.username, bio: user.bio },
    mode: 'onBlur',
  });
  const [saved, setSaved] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // Keep form in sync if external mutation happens (e.g. avatar updates user).
  useEffect(() => {
    form.reset({ name: user.name, username: user.username, bio: user.bio });
  }, [user, form]);

  async function onSubmit(v: ProfileInput) {
    setSaved(false);
    setServerError(null);
    try {
      await updateProfile(v);
      setSaved(true);
    } catch (e) {
      setServerError(e instanceof ApiError && e.message === 'UsernameTaken' ? 'Username is already taken.' : (e as Error).message);
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3" noValidate>
      <Field label="Display name" error={form.formState.errors.name?.message}>
        <TextInput invalid={!!form.formState.errors.name} {...form.register('name')} />
      </Field>
      <Field label="Username" error={form.formState.errors.username?.message} hint="Used in URLs and mentions.">
        <TextInput invalid={!!form.formState.errors.username} {...form.register('username')} />
      </Field>
      <Field label="Bio" error={form.formState.errors.bio?.message}>
        <TextArea rows={3} invalid={!!form.formState.errors.bio} {...form.register('bio')} />
      </Field>
      <FormError message={serverError} />
      <div className="flex items-center gap-3">
        <SubmitButton busy={form.formState.isSubmitting} className="!w-auto px-4">Save changes</SubmitButton>
        {saved && <span className="text-xs text-green-400">Saved.</span>}
      </div>
    </form>
  );
}

function PasswordForm({ onChanged }: { onChanged: () => void }): JSX.Element {
  const changePassword = useAuthStore((s) => s.changePassword);
  const form = useForm<ChangePasswordInput>({ resolver: zodResolver(changePasswordSchema), mode: 'onBlur' });
  const [serverError, setServerError] = useState<string | null>(null);

  async function onSubmit(v: ChangePasswordInput) {
    setServerError(null);
    try {
      await changePassword(v.currentPassword, v.newPassword);
      // changePassword wipes the session — route the user back to /login.
      onChanged();
    } catch (e) {
      const msg = e instanceof ApiError && e.message === 'InvalidCredentials' ? 'Current password is incorrect.' : (e as Error).message;
      setServerError(msg);
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3" noValidate>
      <Field label="Current password" error={form.formState.errors.currentPassword?.message}>
        <TextInput type="password" autoComplete="current-password" {...form.register('currentPassword')} />
      </Field>
      <Field label="New password" error={form.formState.errors.newPassword?.message} hint="8+ chars, upper, lower, number">
        <TextInput type="password" autoComplete="new-password" {...form.register('newPassword')} />
      </Field>
      <Field label="Confirm new password" error={form.formState.errors.confirm?.message}>
        <TextInput type="password" autoComplete="new-password" {...form.register('confirm')} />
      </Field>
      <FormError message={serverError} />
      <SubmitButton busy={form.formState.isSubmitting} className="!w-auto px-4">Update password</SubmitButton>
    </form>
  );
}
