import { useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { authApi } from '@/services/auth.api';
import { resetSchema, type ResetInput } from './schemas';
import { Field, FormError, SubmitButton, TextInput } from './components/Field';

export function ResetPasswordPage(): JSX.Element {
  const [params] = useSearchParams();
  const token = params.get('token');
  const form = useForm<ResetInput>({ resolver: zodResolver(resetSchema), mode: 'onBlur' });
  const [done, setDone] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  if (!token) return <Navigate to="/forgot-password" replace />;

  async function onSubmit(v: ResetInput) {
    setServerError(null);
    try {
      await authApi.resetPassword(token!, v.password);
      setDone(true);
    } catch (e) {
      setServerError(humanize((e as Error).message));
    }
  }

  return (
    <div className="flex h-full items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-4 rounded-lg border border-border bg-surface p-6">
        <h1 className="text-xl font-semibold">Choose a new password</h1>
        {done ? (
          <div className="space-y-3 text-sm">
            <p className="text-zinc-300">Your password has been updated.</p>
            <Link to="/login" className="text-accent">Sign in →</Link>
          </div>
        ) : (
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3" noValidate>
            <Field label="New password" error={form.formState.errors.password?.message} hint="8+ chars, upper, lower, number">
              <TextInput type="password" autoComplete="new-password" invalid={!!form.formState.errors.password} {...form.register('password')} />
            </Field>
            <Field label="Confirm password" error={form.formState.errors.confirm?.message}>
              <TextInput type="password" autoComplete="new-password" invalid={!!form.formState.errors.confirm} {...form.register('confirm')} />
            </Field>
            <FormError message={serverError} />
            <SubmitButton busy={form.formState.isSubmitting}>Update password</SubmitButton>
          </form>
        )}
      </div>
    </div>
  );
}

function humanize(msg: string): string {
  if (msg === 'InvalidOrExpiredToken') return 'This reset link is invalid or has expired. Request a new one.';
  return msg;
}
