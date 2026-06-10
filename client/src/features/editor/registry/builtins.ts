import { registerBlock } from './blockRegistry';
import {
  BulletRender,
  CalloutRender,
  DividerRender,
  HeadingRender,
  NumberedRender,
  QuoteRender,
  TextRender,
  TodoRender,
  ToggleRender,
} from '../blocks/renderers';
import { CodeRender } from '../blocks/CodeBlock';
import { ImageRender } from '../blocks/ImageBlock';
import { DatabaseRender } from '../blocks/DatabaseBlock';
import { TableRender } from '../blocks/TableBlock';
import { TocRender } from '../blocks/TocBlock';
import { VideoRender } from '../blocks/VideoBlock';
import { FileRender } from '../blocks/FileBlock';
import { BookmarkRender } from '../blocks/BookmarkBlock';
import { ColumnsRender, ColumnRender } from '../blocks/ColumnsBlock';
import { AiRender } from '../blocks/AiBlock';

/**
 * Registers all built-in block types + their markdown shortcuts.
 *
 * Markdown patterns are matched on a line whose text starts with the trigger
 * followed by a space. The editor strips the trigger and converts the block.
 */

registerBlock({
  type: 'text',
  label: 'Text',
  hint: 'Plain paragraph',
  icon: 'T',
  Render: TextRender,
  inlineMarks: true,
});

registerBlock({
  type: 'heading',
  label: 'Heading 1',
  hint: 'Big section title',
  icon: 'H1',
  Render: HeadingRender,
  inlineMarks: true,
  markdown: { pattern: /^#\s(.*)$/, extractText: (m) => m[1] },
});

registerBlock({
  type: 'heading2',
  label: 'Heading 2',
  hint: 'Medium section title',
  icon: 'H2',
  Render: HeadingRender,
  inlineMarks: true,
  markdown: { pattern: /^##\s(.*)$/, extractText: (m) => m[1] },
});

registerBlock({
  type: 'heading3',
  label: 'Heading 3',
  hint: 'Small section title',
  icon: 'H3',
  Render: HeadingRender,
  inlineMarks: true,
  markdown: { pattern: /^###\s(.*)$/, extractText: (m) => m[1] },
});

registerBlock({
  type: 'todo',
  label: 'To-do',
  hint: 'Checkbox list',
  icon: '☐',
  Render: TodoRender,
  inlineMarks: true,
  continueOnEnter: true,
  defaultProps: { checked: false },
  markdown: {
    pattern: /^(\[\]|\[\s\]|\[x\])\s(.*)$/i,
    extractText: (m) => m[2],
    propsFromMatch: (m) => ({ checked: m[1].toLowerCase() === '[x]' }),
  },
});

registerBlock({
  type: 'bullet',
  label: 'Bulleted list',
  hint: '• item',
  icon: '•',
  Render: BulletRender,
  inlineMarks: true,
  continueOnEnter: true,
  markdown: { pattern: /^[-*]\s(.*)$/, extractText: (m) => m[1] },
});

registerBlock({
  type: 'numbered',
  label: 'Numbered list',
  hint: '1. item',
  icon: '1.',
  Render: NumberedRender,
  inlineMarks: true,
  continueOnEnter: true,
  markdown: { pattern: /^1\.\s(.*)$/, extractText: (m) => m[1] },
});

registerBlock({
  type: 'quote',
  label: 'Quote',
  hint: 'Italic call-out',
  icon: '❝',
  Render: QuoteRender,
  inlineMarks: true,
  markdown: { pattern: /^>\s(.*)$/, extractText: (m) => m[1] },
});

registerBlock({
  type: 'callout',
  label: 'Callout',
  hint: 'Boxed note with icon',
  icon: '💡',
  Render: CalloutRender,
  inlineMarks: true,
  defaultProps: { icon: '💡' },
});

registerBlock({
  type: 'toggle',
  label: 'Toggle',
  hint: 'Collapsible content',
  icon: '▾',
  Render: ToggleRender,
  inlineMarks: true,
  defaultProps: { open: true },
});

registerBlock({
  type: 'code',
  label: 'Code',
  hint: 'Monospace block w/ syntax highlight',
  icon: '</>',
  Render: CodeRender,
  inlineMarks: false,
  defaultProps: { lang: 'plain' },
  markdown: { pattern: /^```([a-z]*)$/i, extractText: () => '', propsFromMatch: (m) => ({ lang: m[1] || 'plain' }) },
});

registerBlock({
  type: 'divider',
  label: 'Divider',
  hint: 'Horizontal line',
  icon: '—',
  Render: DividerRender,
  hasChildren: false,
  markdown: { pattern: /^---$/, extractText: () => '' },
});

registerBlock({
  type: 'image',
  label: 'Image',
  hint: 'Upload or embed an image',
  icon: '🖼',
  Render: ImageRender,
  inlineMarks: false,
  hasChildren: false,
  defaultProps: { url: '', caption: '' },
});

registerBlock({
  type: 'table',
  label: 'Table',
  hint: 'Editable grid of rows and columns',
  icon: '▦',
  Render: TableRender,
  inlineMarks: false,
  hasChildren: false,
  defaultProps: {
    header: true,
    rows: [
      ['Column 1', 'Column 2', 'Column 3'],
      ['', '', ''],
      ['', '', ''],
    ],
  },
});

registerBlock({
  type: 'database',
  label: 'Database',
  hint: 'Database with rows and columns',
  icon: '🗄',
  Render: DatabaseRender,
  inlineMarks: false,
  hasChildren: false,
  defaultProps: {},
});

registerBlock({
  type: 'toc',
  label: 'Table of contents',
  hint: 'Outline of headings on this page',
  icon: '☰',
  Render: TocRender,
  inlineMarks: false,
  hasChildren: false,
  defaultProps: {},
});

registerBlock({
  type: 'video',
  label: 'Video',
  hint: 'Embed YouTube/Vimeo or upload a file',
  icon: '🎬',
  Render: VideoRender,
  inlineMarks: false,
  hasChildren: false,
  defaultProps: { url: '', embed: false },
});

registerBlock({
  type: 'file',
  label: 'File',
  hint: 'Upload any file as an attachment',
  icon: '📎',
  Render: FileRender,
  inlineMarks: false,
  hasChildren: false,
  defaultProps: { url: '' },
});

registerBlock({
  type: 'bookmark',
  label: 'Bookmark',
  hint: 'Rich preview of a web link',
  icon: '🔖',
  Render: BookmarkRender,
  inlineMarks: false,
  hasChildren: false,
  defaultProps: { url: '' },
});

registerBlock({
  type: 'columns',
  label: 'Columns',
  hint: 'Side-by-side layout',
  icon: '▐▐',
  Render: ColumnsRender,
  inlineMarks: false,
  hasChildren: false,
  defaultProps: {},
});

registerBlock({
  type: 'ai',
  label: 'Ask AI',
  hint: 'Generate content with AI',
  icon: '✨',
  Render: AiRender,
  inlineMarks: false,
  hasChildren: false,
  defaultProps: {},
});

// `column` blocks are created programmatically inside a `columns` container and
// never appear in the slash menu, but must be registered so the editor can
// resolve their renderer.
registerBlock({
  type: 'column',
  label: 'Column',
  hint: '',
  icon: '│',
  Render: ColumnRender,
  inlineMarks: false,
  hasChildren: false,
  hidden: true,
  defaultProps: {},
});
