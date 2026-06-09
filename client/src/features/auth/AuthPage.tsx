import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuthStore } from '@/stores/auth.store';
import { ApiError } from '@/services/http';
import { authApi } from '@/services/auth.api';
import {
  loginSchema,
  signupSchema,
  type LoginInput,
  type SignupInput,
} from './schemas';
import { Field, FormError, SubmitButton, TextInput } from './components/Field';
import { OAuthButtons } from './components/OAuthButtons';
import { Turnstile } from '@/components/Turnstile';

interface Props { mode: 'login' | 'signup' }

export function AuthPage({ mode }: Props): JSX.Element {
  const status = useAuthStore((s) => s.status);
  const login = useAuthStore((s) => s.login);
  const signup = useAuthStore((s) => s.signup);
  const navigate = useNavigate();

  const [serverError, setServerError] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaSiteKey, setCaptchaSiteKey] = useState<string | null>(null);

  // Probe server config once to learn whether Turnstile is enabled. Failure
  // is silent — the server gates submission server-side anyway.
  useEffect(() => {
    let alive = true;
    authApi.config()
      .then((c) => alive && setCaptchaSiteKey(c.captcha?.siteKey ?? null))
      .catch(() => undefined);
    return () => { alive = false; };
  }, []);

  // Two separate form instances so each can be typed precisely.
  const loginForm = useForm<LoginInput>({ resolver: zodResolver(loginSchema), mode: 'onBlur' });
  const signupForm = useForm<SignupInput>({ resolver: zodResolver(signupSchema), mode: 'onBlur' });

  if (status === 'authed') return <Navigate to="/" replace />;

  async function onSubmitLogin(v: LoginInput) {
    setServerError(null);
    try {
      await login(v.email, v.password, captchaToken ?? undefined);
      navigate('/');
    } catch (e) {
      setServerError(humanize(e));
    }
  }

  async function onSubmitSignup(v: SignupInput) {
    setServerError(null);
    try {
      const { email } = await signup(v.email, v.password, v.name, captchaToken ?? undefined);
      navigate(`/check-email?email=${encodeURIComponent(email)}`);
    } catch (e) {
      setServerError(humanize(e));
    }
  }

  const isLogin = mode === 'login';

  return (
    <div className="flex h-full items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-4 rounded-lg border border-border bg-surface p-6">
        <h1 className="text-xl font-semibold">{isLogin ? 'Welcome back' : 'Create your account'}</h1>

        <OAuthButtons />
        <div className="flex items-center gap-3 text-xs text-zinc-500">
          <div className="h-px flex-1 bg-border" />or<div className="h-px flex-1 bg-border" />
        </div>

        {isLogin ? (
          <form onSubmit={loginForm.handleSubmit(onSubmitLogin)} className="space-y-3" noValidate>
            <Field label="Email" error={loginForm.formState.errors.email?.message}>
              <TextInput type="email" autoComplete="email" invalid={!!loginForm.formState.errors.email} {...loginForm.register('email')} />
            </Field>
            <Field label="Password" error={loginForm.formState.errors.password?.message}>
              <TextInput type="password" autoComplete="current-password" invalid={!!loginForm.formState.errors.password} {...loginForm.register('password')} />
            </Field>
            <FormError message={serverError} />
            <Turnstile siteKey={captchaSiteKey} onVerify={setCaptchaToken} />
            <SubmitButton busy={loginForm.formState.isSubmitting}>Log in</SubmitButton>
            <div className="flex justify-between text-xs text-zinc-500">
              <Link to="/forgot-password" className="text-accent">Forgot password?</Link>
              <Link to="/signup" className="text-accent">Create account</Link>
            </div>
          </form>
        ) : (
          <form onSubmit={signupForm.handleSubmit(onSubmitSignup)} className="space-y-3" noValidate>
            <Field label="Name (optional)" error={signupForm.formState.errors.name?.message}>
              <TextInput
                autoComplete="off"
                data-lpignore="true"
                data-1p-ignore=""
                invalid={!!signupForm.formState.errors.name}
                {...signupForm.register('name')}
              />
            </Field>
            <Field label="Email" error={signupForm.formState.errors.email?.message}>
              <TextInput
                type="email"
                autoComplete="username"
                invalid={!!signupForm.formState.errors.email}
                {...signupForm.register('email')}
              />
            </Field>
            <Field
              label="Password"
              error={signupForm.formState.errors.password?.message}
              hint="8+ chars, upper, lower, number"
            >
              <TextInput
                type="password"
                autoComplete="new-password"
                invalid={!!signupForm.formState.errors.password}
                {...signupForm.register('password')}
              />
            </Field>
            <FormError message={serverError} />
            <Turnstile siteKey={captchaSiteKey} onVerify={setCaptchaToken} />
            <SubmitButton busy={signupForm.formState.isSubmitting}>Sign up</SubmitButton>
            <div className="text-center text-xs text-zinc-500">
              Have an account? <Link to="/login" className="text-accent">Log in</Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function humanize(e: unknown): string {
  if (e instanceof ApiError) {
    switch (e.message) {
      case 'EmailInUse': return 'An account with this email already exists.';
      case 'InvalidCredentials': return 'Incorrect email or password.';
      case 'TooManyRequests': return 'Too many attempts. Please try again later.';
      case 'CaptchaRequired': return 'Please complete the CAPTCHA challenge.';
      default: return e.message;
    }
  }
  return (e as Error)?.message ?? 'Something went wrong';
}
