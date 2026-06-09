/** Generic debounce that flushes on cancel. */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, wait: number) {
  let t: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: A | null = null;
  const debounced = (...args: A): void => {
    lastArgs = args;
    if (t) clearTimeout(t);
    t = setTimeout(() => {
      t = null;
      if (lastArgs) fn(...lastArgs);
    }, wait);
  };
  debounced.flush = (): void => {
    if (t) {
      clearTimeout(t);
      t = null;
      if (lastArgs) fn(...lastArgs);
    }
  };
  debounced.cancel = (): void => {
    if (t) clearTimeout(t);
    t = null;
    lastArgs = null;
  };
  return debounced as typeof debounced & { flush: () => void; cancel: () => void };
}
