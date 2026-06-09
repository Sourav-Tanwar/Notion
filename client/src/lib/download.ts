/** Trigger a browser download of in-memory text content. */
export function downloadText(filename: string, content: string, mime = 'text/plain'): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on the next tick so the navigation has a chance to start.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Turn a page title into a safe-ish file basename. */
export function slugifyFilename(title: string, fallback = 'untitled'): string {
  const base = title
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 80)
    .trim();
  return base || fallback;
}

/**
 * Open HTML in a new window and trigger the print dialog (Save as PDF). Returns
 * false if the popup was blocked.
 *
 * We load the document from a Blob URL rather than `document.write` so the tab
 * gets a real address (not `about:blank`) and uses the document's <title>.
 */
export function printHtml(html: string): boolean {
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  const w = window.open(url, '_blank');
  if (!w) {
    URL.revokeObjectURL(url);
    return false;
  }

  const fire = (): void => {
    w.focus();
    w.print();
  };
  // Print once the blob document has loaded; give images/fonts a beat to lay
  // out, then release the object URL.
  w.addEventListener('load', () => {
    setTimeout(fire, 300);
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  });
  return true;
}
