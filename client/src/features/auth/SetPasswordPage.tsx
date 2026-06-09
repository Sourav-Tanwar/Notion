import { useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { authApi } from '@/services/auth.api';
import { ApiError } from '@/services/http';
import { resetSchema, type ResetInput } from './schemas';
import { Field, FormError, SubmitButton, TextInput } from './components/Field';

/**
 * Mirror of ResetPasswordPage for OAuth-only accounts opting in to a local
 * password. Shape and copy are intentionally distinct from "Reset" so the
 * user (and any auditor reading server logs) can tell the flows apart.
 */
export function SetPasswordPage(): JSX.Element {
  const [params] = useSearchParams();
  const token = params.get('token');
  const form = useForm<ResetInput>({ resolver: zodResolver(resetSchema), mode: 'onBlur' });
  const [done, setDone] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  if (!token) return <Navigate to="/login" replace />;

  async function onSubmit(v: ResetInput) {
    setServerError(null);
    try {
      await authApi.setPassword(token!, v.password);
      setDone(true);
    } catch (e) {
      setServerError(humanize(e));
    }
  }

  return (
    <div className="flex h-full items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-4 rounded-lg border border-border bg-surface p-6">
        <h1 className="text-xl font-semibold">Set a password</h1>
        {done ? (
          <div className="space-y-3 text-sm">
            <p className="text-zinc-300">Password set. You can now sign in with email and password too.</p>
            <Link to="/login" className="text-accent">Sign in →</Link>
          </div>
        ) : (
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3" noValidate>
            <Field
              label="New password"
              error={form.formState.errors.password?.message}
              hint="8+ chars, upper, lower, number"
            >
              <TextInput
                type="password"
                autoComplete="new-password"
                invalid={!!form.formState.errors.password}
                {...form.register('password')}
              />
            </Field>
            <Field label="Confirm password" error={form.formState.errors.confirm?.message}>
              <TextInput
                type="password"
                autoComplete="new-password"
                invalid={!!form.formState.errors.confirm}
                {...form.register('confirm')}
              />
            </Field>
            <FormError message={serverError} />
            <SubmitButton busy={form.formState.isSubmitting}>Set password</SubmitButton>
          </form>
        )}
      </div>
    </div>
  );
}

function humanize(e: unknown): string {
  if (!(e instanceof ApiError)) return (e as Error).message;
  switch (e.message) {
    case 'InvalidOrExpiredToken':
      return 'This link is invalid or has expired. Request a new one from account settings.';
    case 'PasswordAlreadySet':
      return 'A password is already set on this account. Use "Change password" instead.';
    default:
      return e.message;
  }
}
