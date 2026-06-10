import { useMemo } from 'react';
import type { PublicBlockDTO } from '@/services/shareLinks.api';

/**
 * Read-only block renderer for the public share viewer.
 *
 * We intentionally do NOT reuse the editor's BlockNode tree: the editor is
 * tied to selection.store / blocks.store, both of which assume an
 * authenticated session. A minimal renderer here covers the common block
 * shapes and keeps the public bundle small.
 *
 * `text` for text-like blocks is HTML (mirrors how the editor persists
 * inline marks like bold/italic). We trust it because it was sanitized
 * on write by the editor — but it still passed through the server, so
 * `dangerouslySetInnerHTML` is the right primitive given the data model.
 * If we ever accept untrusted inputs, swap in DOMPurify here.
 */

interface Props {
  blocks: PublicBlockDTO[];
}

interface Node {
  block: PublicBlockDTO;
  children: Node[];
}

function buildTree(blocks: PublicBlockDTO[]): Node[] {
  const byId = new Map<string, Node>();
  for (const b of blocks) byId.set(b.id, { block: b, children: [] });
  const roots: Node[] = [];
  for (const b of [...blocks].sort((a, b) => a.order - b.order)) {
    const node = byId.get(b.id)!;
    if (b.parentId && byId.has(b.parentId)) byId.get(b.parentId)!.children.push(node);
    else roots.push(node);
  }
  return roots;
}

export function PublicBlockRenderer({ blocks }: Props): JSX.Element {
  const tree = useMemo(() => buildTree(blocks), [blocks]);
  return (
    <div className="space-y-1.5 text-[15px] leading-7 text-zinc-800 dark:text-zinc-200">
      {tree.map((n) => (
        <RenderNode key={n.block.id} node={n} />
      ))}
    </div>
  );
}

function RenderNode({ node }: { node: Node }): JSX.Element {
  const { block, children } = node;
  const html = { __html: block.text };
  const kids = children.length > 0 && (
    <div className="ml-5 space-y-1.5">
      {children.map((c) => (
        <RenderNode key={c.block.id} node={c} />
      ))}
    </div>
  );

  switch (block.type) {
    case 'heading':
      return (
        <>
          <h1 className="mt-4 text-2xl font-semibold" dangerouslySetInnerHTML={html} />
          {kids}
        </>
      );
    case 'heading2':
      return (
        <>
          <h2 className="mt-3 text-xl font-semibold" dangerouslySetInnerHTML={html} />
          {kids}
        </>
      );
    case 'heading3':
      return (
        <>
          <h3 className="mt-2 text-lg font-semibold" dangerouslySetInnerHTML={html} />
          {kids}
        </>
      );
    case 'quote':
      return (
        <>
          <blockquote
            className="border-l-2 border-zinc-400 pl-3 italic text-zinc-600 dark:text-zinc-400"
            dangerouslySetInnerHTML={html}
          />
          {kids}
        </>
      );
    case 'callout':
      return (
        <>
          <div className="rounded bg-zinc-100 p-3 text-sm dark:bg-zinc-800">
            <div dangerouslySetInnerHTML={html} />
            {kids}
          </div>
        </>
      );
    case 'bullet':
      return (
        <>
          <div className="flex gap-2">
            <span aria-hidden>•</span>
            <div className="flex-1" dangerouslySetInnerHTML={html} />
          </div>
          {kids}
        </>
      );
    case 'numbered':
      return (
        <>
          <div className="flex gap-2">
            <span aria-hidden>{(block.props.index as number | undefined) ?? '•'}.</span>
            <div className="flex-1" dangerouslySetInnerHTML={html} />
          </div>
          {kids}
        </>
      );
    case 'todo': {
      const checked = Boolean(block.props.checked);
      return (
        <>
          <div className="flex gap-2">
            <input type="checkbox" checked={checked} readOnly className="mt-1.5" />
            <div
              className={`flex-1 ${checked ? 'text-zinc-400 line-through' : ''}`}
              dangerouslySetInnerHTML={html}
            />
          </div>
          {kids}
        </>
      );
    }
    case 'toggle':
      return (
        <>
          <details className="rounded">
            <summary
              className="cursor-pointer list-none"
              dangerouslySetInnerHTML={html}
            />
            <div className="ml-5 mt-1 space-y-1.5">{children.map((c) => <RenderNode key={c.block.id} node={c} />)}</div>
          </details>
        </>
      );
    case 'code': {
      const lang = (block.props.lang as string) || '';
      return (
        <pre className="overflow-x-auto rounded bg-zinc-900 p-3 text-xs text-zinc-100">
          <code data-lang={lang}>{block.text}</code>
        </pre>
      );
    }
    case 'divider':
      return <hr className="my-4 border-zinc-200 dark:border-zinc-700" />;
    case 'table': {
      const rows = Array.isArray(block.props.rows) ? (block.props.rows as unknown[][]) : [];
      if (!rows.length) return <></>;
      const header = block.props.header !== false;
      return (
        <div className="my-2 w-full overflow-x-auto">
          <table className="border-collapse text-sm">
            <tbody>
              {rows.map((row, r) => (
                <tr key={r}>
                  {(Array.isArray(row) ? row : []).map((cell, c) => {
                    const text = cell == null ? '' : String(cell);
                    return header && r === 0 ? (
                      <th
                        key={c}
                        className="border border-zinc-200 bg-zinc-50 px-2 py-1 text-left font-semibold dark:border-zinc-700 dark:bg-zinc-800"
                      >
                        {text}
                      </th>
                    ) : (
                      <td
                        key={c}
                        className="border border-zinc-200 px-2 py-1 align-top dark:border-zinc-700"
                      >
                        {text}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    case 'image': {
      const url = block.props.url as string | undefined;
      if (!url) return <></>;
      return (
        <figure>
          <img src={url} alt="" className="my-2 max-w-full rounded" />
        </figure>
      );
    }
    case 'text':
    default:
      return (
        <>
          <div dangerouslySetInnerHTML={html} />
          {kids}
        </>
      );
  }
}
