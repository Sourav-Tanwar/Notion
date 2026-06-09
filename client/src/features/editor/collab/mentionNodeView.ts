/**
 * ProseMirror NodeView for the `pageMention` inline node.
 *
 * Renders a clickable chip showing the target page's *live* icon + title
 * (resolved from the pages store, so renames reflect immediately). Clicking
 * navigates to the page via the router bridge instead of doing a full reload.
 */

import type { Node as PMNode } from 'prosemirror-model';
import type { NodeView } from 'prosemirror-view';
import { usePagesStore } from '@/stores/pages.store';
import { navigateToPage } from './mentionNav';

class MentionView implements NodeView {
  dom: HTMLAnchorElement;
  private pageId: string;
  private unsub: () => void;

  constructor(node: PMNode) {
    this.pageId = String(node.attrs.pageId);
    const dom = document.createElement('a');
    dom.className = 'pm-mention';
    dom.contentEditable = 'false';
    dom.setAttribute('data-page-id', this.pageId);
    dom.href = `/p/${this.pageId}`;
    dom.addEventListener('mousedown', (e) => {
      // Prevent PM from placing a text selection inside the atom.
      e.preventDefault();
    });
    dom.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      navigateToPage(this.pageId);
    });
    this.dom = dom;
    this.render(node);

    // Re-render on any pages-store change so title/icon edits propagate.
    this.unsub = usePagesStore.subscribe(() => this.render(node));
  }

  private render(node: PMNode): void {
    const page = usePagesStore.getState().byId[this.pageId];
    const icon = page?.icon ?? node.attrs.icon ?? '📄';
    const title = page?.title || node.attrs.label || 'Untitled';
    this.dom.textContent = `${icon} ${title}`;
  }

  update(node: PMNode): boolean {
    if (node.type.name !== 'pageMention') return false;
    if (String(node.attrs.pageId) !== this.pageId) return false;
    this.render(node);
    return true;
  }

  stopEvent(): boolean {
    return true;
  }

  ignoreMutation(): boolean {
    return true;
  }

  destroy(): void {
    this.unsub();
  }
}

export function makeMentionView(node: PMNode): NodeView {
  return new MentionView(node);
}
