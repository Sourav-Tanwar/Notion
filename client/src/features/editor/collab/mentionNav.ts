/**
 * Module-level bridge so ProseMirror NodeViews (which live outside the React
 * tree) can trigger client-side navigation when a page mention is clicked.
 *
 * `Editor` registers the router's `navigate` on mount; the mention NodeView
 * calls `navigateToPage(id)` on click. Falls back to a hard location change
 * if no navigator is registered (e.g. read-only viewer).
 */

type NavFn = (pageId: string) => void;

let navigator: NavFn | null = null;

export function setMentionNavigate(fn: NavFn | null): void {
  navigator = fn;
}

export function navigateToPage(pageId: string): void {
  if (navigator) navigator(pageId);
  else window.location.assign(`/p/${pageId}`);
}
