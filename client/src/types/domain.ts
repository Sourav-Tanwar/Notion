export type ID = string;

/**
 * Built-in block kinds. Extensible at runtime via the BlockRegistry, but the
 * union here gives editor-internal code (e.g. markdown rules) discriminated
 * narrowing for the common path.
 */
export type BlockType =
  | 'text'
  | 'heading'
  | 'heading2'
  | 'heading3'
  | 'todo'
  | 'bullet'
  | 'numbered'
  | 'code'
  | 'toggle'
  | 'callout'
  | 'quote'
  | 'divider'
  | 'image'
  | 'video'
  | 'file'
  | 'bookmark'
  | 'toc'
  | 'columns'
  | 'column'
  | 'database';

export interface Block {
  id: ID;
  pageId: ID;
  parentId: ID | null;
  type: BlockType;
  /**
   * For text-like blocks, this stores the *HTML* of inline content
   * (so inline marks like bold/italic survive without a separate marks model).
   * For code: plain source. For divider: ignored.
   */
  text: string;
  order: number;
  props: Record<string, unknown>; // e.g. { checked: bool, lang: 'ts', open: bool, color: '...' }
}

export interface Page {
  id: ID;
  parentId: ID | null;
  title: string;
  icon: string;
  /** Wide banner image URL shown above the title. null if unset. */
  coverUrl: string | null;
  /** True if pinned to the Favorites section of the sidebar. */
  favorite: boolean;
  /** When set, the page is in Trash. ISO string. */
  archivedAt: string | null;
  /** True if this page is a reusable template (hidden from the sidebar tree). */
  isTemplate?: boolean;
  /** Render content edge-to-edge instead of the centered column. */
  fullWidth?: boolean;
  /** Render body text one step smaller. */
  smallText?: boolean;
  /** Read-only lock: content cannot be edited while true. */
  locked?: boolean;
  order: number;
  updatedAt?: string;
}

export interface User {
  id: ID;
  email: string;
  emailVerified: boolean;
  name: string;
  username: string | null;
  bio: string;
  avatarUrl: string | null;
  role: 'user' | 'admin';
  themePref: 'system' | 'light' | 'dark';
  /** True when a local password credential exists. Drives change-vs-set UX
   *  for OAuth-only accounts. Computed server-side from passwordHash != null. */
  hasPassword: boolean;
}
