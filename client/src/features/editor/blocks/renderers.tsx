import { useBlocksStore } from '@/stores/blocks.store';
import type { RenderProps } from '../registry/blockRegistry';
import { Editable } from '../Editable';

/* ---------------- text-like ---------------- */

export function TextRender({ block, onKeyDown, registerEditable }: RenderProps): JSX.Element {
  return (
    <Editable
      id={block.id}
      html={block.text}
      placeholder="Type '/' for commands"
      className="py-1 leading-snug"
      onKeyDown={onKeyDown}
      registerEditable={registerEditable}
    />
  );
}

export function HeadingRender({ block, onKeyDown, registerEditable }: RenderProps): JSX.Element {
  const size =
    block.type === 'heading' ? 'text-3xl font-bold'
    : block.type === 'heading2' ? 'text-2xl font-semibold'
    : 'text-xl font-semibold';
  return (
    <Editable
      id={block.id}
      html={block.text}
      placeholder="Heading"
      className={`${size} py-1 leading-tight`}
      onKeyDown={onKeyDown}
      registerEditable={registerEditable}
    />
  );
}

export function QuoteRender({ block, onKeyDown, registerEditable }: RenderProps): JSX.Element {
  return (
    <div className="border-l-2 border-zinc-500 pl-3 italic text-zinc-300">
      <Editable
        id={block.id}
        html={block.text}
        placeholder="Quote"
        className="py-1"
        onKeyDown={onKeyDown}
        registerEditable={registerEditable}
      />
    </div>
  );
}

/* ---------------- todo ---------------- */

export function TodoRender({ block, onKeyDown, registerEditable }: RenderProps): JSX.Element {
  const setProp = useBlocksStore((s) => s.setProp);
  const checked = Boolean(block.props.checked);
  return (
    <div className="flex items-start gap-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={() => setProp(block.id, 'checked', !checked)}
        className="mt-2 h-4 w-4 accent-accent"
        aria-label="toggle"
      />
      <Editable
        id={block.id}
        html={block.text}
        placeholder="To-do"
        className={`flex-1 py-1 ${checked ? 'line-through text-zinc-500' : ''}`}
        onKeyDown={onKeyDown}
        registerEditable={registerEditable}
      />
    </div>
  );
}

/* ---------------- lists ---------------- */

export function BulletRender({ block, onKeyDown, registerEditable }: RenderProps): JSX.Element {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-1 select-none text-zinc-400">•</span>
      <Editable
        id={block.id}
        html={block.text}
        placeholder="List"
        className="flex-1 py-1"
        onKeyDown={onKeyDown}
        registerEditable={registerEditable}
      />
    </div>
  );
}

export function NumberedRender({ block, onKeyDown, registerEditable }: RenderProps): JSX.Element {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-1 select-none text-zinc-400 tabular-nums">{((block.props.index as number) ?? 0) + 1}.</span>
      <Editable
        id={block.id}
        html={block.text}
        placeholder="List"
        className="flex-1 py-1"
        onKeyDown={onKeyDown}
        registerEditable={registerEditable}
      />
    </div>
  );
}

/* ---------------- callout ---------------- */

export function CalloutRender({ block, onKeyDown, registerEditable }: RenderProps): JSX.Element {
  const setProp = useBlocksStore((s) => s.setProp);
  const icon = (block.props.icon as string) ?? '💡';
  return (
    <div className="flex items-start gap-3 rounded-md border border-border bg-surface px-3 py-2">
      <button
        className="text-xl leading-none"
        onClick={() => {
          const next = window.prompt('Icon', icon);
          if (next) setProp(block.id, 'icon', next);
        }}
        aria-label="change icon"
      >
        {icon}
      </button>
      <Editable
        id={block.id}
        html={block.text}
        placeholder="Type something..."
        className="flex-1 py-0.5"
        onKeyDown={onKeyDown}
        registerEditable={registerEditable}
      />
    </div>
  );
}

/* ---------------- toggle ---------------- */

export function ToggleRender({ block, onKeyDown, registerEditable }: RenderProps): JSX.Element {
  const setProp = useBlocksStore((s) => s.setProp);
  const open = block.props.open !== false;
  return (
    <div className="flex items-start gap-1">
      <button
        onClick={() => setProp(block.id, 'open', !open)}
        className="mt-1 h-5 w-5 select-none text-zinc-400 hover:text-zinc-100"
        aria-label={open ? 'collapse' : 'expand'}
      >
        {open ? '▾' : '▸'}
      </button>
      <Editable
        id={block.id}
        html={block.text}
        placeholder="Toggle"
        className="flex-1 py-1"
        onKeyDown={onKeyDown}
        registerEditable={registerEditable}
      />
    </div>
  );
}

/* ---------------- divider ---------------- */

export function DividerRender(): JSX.Element {
  return <hr className="my-2 border-zinc-700" />;
}
