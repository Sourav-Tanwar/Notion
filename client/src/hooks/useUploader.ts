import { useCallback, useState } from 'react';

/**
 * Generic file upload hook with progress, validation, and a typed result.
 * Backed by XHR (not fetch) so we get real upload progress.
 */
export interface UploaderOptions<T> {
  url: string;
  fieldName?: string;
  maxBytes?: number;
  accept?: readonly string[];
  getAuthHeader?: () => string | null;
  parse?: (body: unknown) => T;
}

export interface UploadState<T> {
  status: 'idle' | 'validating' | 'uploading' | 'success' | 'error';
  progress: number;
  result: T | null;
  error: string | null;
}

export function useUploader<T = unknown>(opts: UploaderOptions<T>) {
  const [state, setState] = useState<UploadState<T>>({
    status: 'idle',
    progress: 0,
    result: null,
    error: null,
  });

  const upload = useCallback(
    (file: File): Promise<T> => {
      return new Promise<T>((resolve, reject) => {
        setState({ status: 'validating', progress: 0, result: null, error: null });
        if (opts.accept && !opts.accept.includes(file.type)) {
          const err = `Unsupported file type: ${file.type}`;
          setState((s) => ({ ...s, status: 'error', error: err }));
          return reject(new Error(err));
        }
        if (opts.maxBytes && file.size > opts.maxBytes) {
          const err = `File exceeds ${(opts.maxBytes / 1024 / 1024).toFixed(1)} MB`;
          setState((s) => ({ ...s, status: 'error', error: err }));
          return reject(new Error(err));
        }

        const fd = new FormData();
        fd.append(opts.fieldName ?? 'file', file);

        const xhr = new XMLHttpRequest();
        xhr.open('POST', opts.url);
        xhr.withCredentials = true;
        const auth = opts.getAuthHeader?.();
        if (auth) xhr.setRequestHeader('Authorization', auth);

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            setState((s) => ({ ...s, status: 'uploading', progress: Math.round((e.loaded / e.total) * 100) }));
          }
        };
        xhr.onerror = () => {
          setState((s) => ({ ...s, status: 'error', error: 'Network error' }));
          reject(new Error('Network error'));
        };
        xhr.onload = () => {
          let body: unknown = undefined;
          try { body = JSON.parse(xhr.responseText); } catch { /* empty */ }
          if (xhr.status >= 200 && xhr.status < 300) {
            const parsed = (opts.parse ? opts.parse(body) : (body as T));
            setState({ status: 'success', progress: 100, result: parsed, error: null });
            resolve(parsed);
          } else {
            const err = (body as { error?: string })?.error ?? `Upload failed (${xhr.status})`;
            setState((s) => ({ ...s, status: 'error', error: err }));
            reject(new Error(err));
          }
        };

        xhr.send(fd);
      });
    },
    [opts],
  );

  const reset = useCallback(() => setState({ status: 'idle', progress: 0, result: null, error: null }), []);
  return { ...state, upload, reset };
}
