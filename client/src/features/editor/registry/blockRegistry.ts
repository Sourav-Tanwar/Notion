import type { ComponentType, KeyboardEvent } from 'react';
import type { Block, BlockType } from '@/types/domain';

/**
 * BLOCK PLUGIN ARCHITECTURE
 * --------------------------------------------------------------------
 * Every block type is described by a BlockSpec. Editor internals do not
 * hardcode behavior for individual types — they read the spec at runtime.
 *
 * Adding a new block type = registering a new spec. Nothing else changes.
 *
 * The renderer (BlockNode) delegates the *content surface* to spec.Render,
 * while keeping common concerns (drag handle, multi-select highlight,
 * children recursion, context menu) generic.
 */

export interface RenderProps {
  block: Block;
  /** Used by inputs/contenteditable to focus this block on demand. */
  registerEditable: (el: HTMLElement | null) => void;
  /** Standard key handler installed by BlockNode (Enter, Backspace, Tab, /). */
  onKeyDown: (e: KeyboardEvent<HTMLElement>) => void;
}

export interface BlockSpec {
  type: BlockType | (string & {});
  label: string;
  hint: string;
  icon?: string;

  /** Component that renders the editable content surface of one block. */
  Render: ComponentType<RenderProps>;

  /** Default props applied when a new block of this type is created. */
  defaultProps?: Record<string, unknown>;

  /** Whether children render below this block (recursive list). Default true. */
  hasChildren?: boolean;

  /** If true, pressing Enter at end creates another block of the same type
   *  (used by bullet / numbered / todo / toggle). */
  continueOnEnter?: boolean;

  /** Markdown auto-transform: line text → BlockSpec change. Tested AFTER the
   *  trigger char and a trailing space have been typed. Return the trimmed
   *  remainder (text to keep), or null if it shouldn't match. */
  markdown?: {
    pattern: RegExp;
    /** Optional transformer for the remainder; defaults to capture group 1. */
    extractText?: (match: RegExpMatchArray) => string;
    /** Optional default props to apply on the transformed block. */
    propsFromMatch?: (match: RegExpMatchArray) => Record<string, unknown>;
  };

  /** Whether this block accepts inline marks (bold/italic/etc.). */
  inlineMarks?: boolean;

  /** Hide from the slash menu / block picker (e.g. internal `column` blocks). */
  hidden?: boolean;
}

const registry = new Map<string, BlockSpec>();

export const registerBlock = (spec: BlockSpec): void => {
  registry.set(spec.type, spec);
};

export const getBlockSpec = (type: string): BlockSpec | undefined => registry.get(type);

export const allBlockSpecs = (): BlockSpec[] => [...registry.values()];

/** Find the first registered block whose markdown rule matches the input. */
export const matchMarkdown = (text: string): { spec: BlockSpec; match: RegExpMatchArray } | null => {
  for (const spec of registry.values()) {
    if (!spec.markdown) continue;
    const m = text.match(spec.markdown.pattern);
    if (m) return { spec, match: m };
  }
  return null;
};
