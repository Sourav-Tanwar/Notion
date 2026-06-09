import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

interface FieldProps {
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}

export function Field({ label, error, hint, children }: FieldProps): JSX.Element {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-xs text-red-500 dark:text-red-400">{error}</span> : hint ? <span className="mt-1 block text-xs text-zinc-500">{hint}</span> : null}
    </label>
  );
}

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  ({ className, invalid, ...rest }, ref) => (
    <input
      ref={ref}
      {...rest}
      className={cn(
        'w-full rounded border bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition placeholder:text-zinc-400 dark:bg-[#191919] dark:text-zinc-100 dark:placeholder:text-zinc-500',
        invalid
          ? 'border-red-500 focus:border-red-400'
          : 'border-zinc-300 focus:border-blue-500 dark:border-zinc-700 dark:focus:border-blue-400',
        className,
      )}
    />
  ),
);
TextInput.displayName = 'TextInput';

export const TextArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(
  ({ className, invalid, ...rest }, ref) => (
    <textarea
      ref={ref}
      {...rest}
      className={cn(
        'w-full rounded border bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition placeholder:text-zinc-400 dark:bg-[#191919] dark:text-zinc-100 dark:placeholder:text-zinc-500',
        invalid
          ? 'border-red-500 focus:border-red-400'
          : 'border-zinc-300 focus:border-blue-500 dark:border-zinc-700 dark:focus:border-blue-400',
        className,
      )}
    />
  ),
);
TextArea.displayName = 'TextArea';

export function SubmitButton({ busy, children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean }): JSX.Element {
  return (
    <button
      {...rest}
      disabled={busy || rest.disabled}
      className={cn(
        'w-full rounded bg-accent px-3 py-2 text-sm font-medium text-white transition disabled:opacity-60',
        rest.className,
      )}
    >
      {busy ? '…' : children}
    </button>
  );
}

export function FormError({ message }: { message: string | null }): JSX.Element | null {
  if (!message) return null;
  return <div className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">{message}</div>;
}
