import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { authApi } from '@/services/auth.api';
import { forgotSchema, type ForgotInput } from './schemas';
import { Field, FormError, SubmitButton, TextInput } from './components/Field';

export function ForgotPasswordPage(): JSX.Element {
  const form = useForm<ForgotInput>({ resolver: zodResolver(forgotSchema), mode: 'onBlur' });
  const [done, setDone] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  async function onSubmit(v: ForgotInput) {
    setServerError(null);
    try {
      await authApi.forgotPassword(v.email);
      setDone(true);
    } catch (e) {
      setServerError((e as Error).message);
    }
  }

  return (
    <div className="flex h-full items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-4 rounded-lg border border-border bg-surface p-6">
        <h1 className="text-xl font-semibold">Reset your password</h1>
        {done ? (
          <p className="text-sm text-zinc-400">
            If an account exists for that email, a reset link is on its way. Check your inbox.
          </p>
        ) : (
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3" noValidate>
            <Field label="Email" error={form.formState.errors.email?.message}>
              <TextInput type="email" autoComplete="email" invalid={!!form.formState.errors.email} {...form.register('email')} />
            </Field>
            <FormError message={serverError} />
            <SubmitButton busy={form.formState.isSubmitting}>Send reset link</SubmitButton>
          </form>
        )}
        <div className="text-center text-xs text-zinc-500">
          <Link to="/login" className="text-accent">Back to login</Link>
        </div>
      </div>
    </div>
  );
}
