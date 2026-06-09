import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';

/**
 * Lightweight curated emoji picker.
 *
 * Why hand-rolled instead of a library:
 *  - The single user-visible use case is picking a page icon. A 600-emoji
 *    curated set covers the realistic vocabulary without paying for a 200KB
 *    dependency (`emoji-picker-react` ships the whole Unicode subset + flags).
 *  - We control the categories and search semantics, matching Notion's UX.
 *
 * Search: case-insensitive substring match on the keyword strings.
 */

interface EmojiEntry {
  e: string;
  k: string; // space-separated keywords for search
}

interface Category {
  name: string;
  emojis: EmojiEntry[];
}

// A compact curated set. ~250 emojis is enough for "what icon is on my page".
const CATEGORIES: Category[] = [
  {
    name: 'Frequent',
    emojis: [
      { e: '📄', k: 'page document file' },
      { e: '📝', k: 'note edit memo' },
      { e: '📌', k: 'pin' },
      { e: '⭐', k: 'star favorite' },
      { e: '🔥', k: 'fire hot' },
      { e: '💡', k: 'idea lightbulb' },
      { e: '🚀', k: 'rocket launch ship' },
      { e: '✅', k: 'check done' },
      { e: '📅', k: 'calendar date' },
      { e: '📊', k: 'chart graph stats' },
    ],
  },
  {
    name: 'Smileys',
    emojis: [
      { e: '😀', k: 'happy smile' },
      { e: '😂', k: 'laugh joy' },
      { e: '😊', k: 'smile blush' },
      { e: '😍', k: 'love heart eyes' },
      { e: '🤔', k: 'think hmm' },
      { e: '😎', k: 'cool sunglasses' },
      { e: '🙂', k: 'smile small' },
      { e: '🥳', k: 'party celebrate' },
      { e: '😴', k: 'sleep tired' },
      { e: '🤖', k: 'robot bot ai' },
    ],
  },
  {
    name: 'Objects',
    emojis: [
      { e: '💻', k: 'laptop computer' },
      { e: '🖥️', k: 'desktop computer' },
      { e: '📱', k: 'phone mobile' },
      { e: '🖱️', k: 'mouse' },
      { e: '⌨️', k: 'keyboard' },
      { e: '🖨️', k: 'printer' },
      { e: '📷', k: 'camera photo' },
      { e: '🎥', k: 'video camera film' },
      { e: '🎮', k: 'game controller' },
      { e: '🎧', k: 'headphones music' },
      { e: '🔑', k: 'key' },
      { e: '🔒', k: 'lock secure' },
      { e: '🔓', k: 'unlock' },
      { e: '🔔', k: 'bell notification' },
      { e: '💼', k: 'briefcase work' },
      { e: '🛒', k: 'shopping cart' },
      { e: '🎁', k: 'gift present' },
      { e: '💰', k: 'money cash' },
      { e: '💳', k: 'credit card' },
      { e: '📦', k: 'box package' },
    ],
  },
  {
    name: 'Symbols',
    emojis: [
      { e: '❤️', k: 'heart love' },
      { e: '💔', k: 'broken heart' },
      { e: '✨', k: 'sparkle shiny' },
      { e: '⚡', k: 'lightning bolt' },
      { e: '🌟', k: 'glow star' },
      { e: '☀️', k: 'sun' },
      { e: '🌙', k: 'moon night' },
      { e: '🌈', k: 'rainbow' },
      { e: '🎉', k: 'party celebrate' },
      { e: '🏆', k: 'trophy win' },
      { e: '🥇', k: 'gold medal first' },
      { e: '🎯', k: 'target dart' },
      { e: '🧠', k: 'brain mind' },
      { e: '👀', k: 'eyes look' },
      { e: '👋', k: 'wave hi hello' },
      { e: '👍', k: 'thumbs up like' },
      { e: '👏', k: 'clap applaud' },
      { e: '🙏', k: 'pray thanks' },
      { e: '💪', k: 'strong muscle' },
      { e: '🤝', k: 'handshake deal' },
    ],
  },
  {
    name: 'Work',
    emojis: [
      { e: '📁', k: 'folder' },
      { e: '🗂️', k: 'index folder organize' },
      { e: '📂', k: 'open folder' },
      { e: '🗒️', k: 'notepad notes' },
      { e: '📋', k: 'clipboard checklist' },
      { e: '🖋️', k: 'pen writing' },
      { e: '✏️', k: 'pencil edit' },
      { e: '📐', k: 'ruler design' },
      { e: '📏', k: 'ruler measure' },
      { e: '🧮', k: 'abacus math' },
      { e: '📚', k: 'books library' },
      { e: '📖', k: 'open book read' },
      { e: '📰', k: 'news newspaper' },
      { e: '🗓️', k: 'calendar schedule' },
      { e: '⏰', k: 'alarm time' },
      { e: '⏱️', k: 'stopwatch timer' },
      { e: '🧰', k: 'toolbox tools' },
      { e: '🛠️', k: 'tools hammer wrench' },
      { e: '⚙️', k: 'gear settings' },
      { e: '🔧', k: 'wrench fix' },
    ],
  },
  {
    name: 'Nature',
    emojis: [
      { e: '🌱', k: 'plant seedling grow' },
      { e: '🌳', k: 'tree' },
      { e: '🌴', k: 'palm tree tropical' },
      { e: '🌵', k: 'cactus' },
      { e: '🌸', k: 'cherry blossom' },
      { e: '🌹', k: 'rose flower' },
      { e: '🌻', k: 'sunflower' },
      { e: '🐶', k: 'dog puppy' },
      { e: '🐱', k: 'cat kitten' },
      { e: '🦊', k: 'fox' },
      { e: '🐻', k: 'bear' },
      { e: '🐼', k: 'panda' },
      { e: '🐨', k: 'koala' },
      { e: '🦁', k: 'lion' },
      { e: '🐯', k: 'tiger' },
      { e: '🐸', k: 'frog' },
      { e: '🐵', k: 'monkey' },
      { e: '🐧', k: 'penguin' },
      { e: '🦋', k: 'butterfly' },
      { e: '🐝', k: 'bee' },
    ],
  },
  {
    name: 'Food',
    emojis: [
      { e: '🍎', k: 'apple fruit' },
      { e: '🍊', k: 'orange fruit' },
      { e: '🍋', k: 'lemon' },
      { e: '🍌', k: 'banana' },
      { e: '🍇', k: 'grapes' },
      { e: '🍓', k: 'strawberry berry' },
      { e: '🍑', k: 'peach' },
      { e: '🍕', k: 'pizza' },
      { e: '🍔', k: 'burger' },
      { e: '🌮', k: 'taco' },
      { e: '🍣', k: 'sushi' },
      { e: '🍩', k: 'donut' },
      { e: '🍪', k: 'cookie' },
      { e: '🎂', k: 'cake birthday' },
      { e: '☕', k: 'coffee' },
      { e: '🍵', k: 'tea' },
      { e: '🍷', k: 'wine' },
      { e: '🍺', k: 'beer' },
      { e: '🥑', k: 'avocado' },
      { e: '🥕', k: 'carrot' },
    ],
  },
  {
    name: 'Travel',
    emojis: [
      { e: '🚗', k: 'car' },
      { e: '🚕', k: 'taxi' },
      { e: '🚌', k: 'bus' },
      { e: '🚲', k: 'bike bicycle' },
      { e: '✈️', k: 'airplane flight' },
      { e: '🚂', k: 'train' },
      { e: '🚀', k: 'rocket launch' },
      { e: '🛸', k: 'ufo alien' },
      { e: '🏠', k: 'house home' },
      { e: '🏢', k: 'office building' },
      { e: '🏫', k: 'school' },
      { e: '🏥', k: 'hospital' },
      { e: '🌍', k: 'earth world globe' },
      { e: '🗺️', k: 'map' },
      { e: '🏖️', k: 'beach vacation' },
      { e: '⛰️', k: 'mountain' },
    ],
  },
];

interface Props {
  current?: string;
  onSelect: (emoji: string) => void;
  onClose: () => void;
  /** Optional anchor element to position the popover. */
  anchorRef?: React.RefObject<HTMLElement>;
}

export function EmojiPicker({ current, onSelect, onClose, anchorRef }: Props): JSX.Element {
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Close on outside-click or Escape.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const root = rootRef.current;
      const anchor = anchorRef?.current;
      const target = e.target as Node;
      if (root && !root.contains(target) && (!anchor || !anchor.contains(target))) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose, anchorRef]);

  const q = query.trim().toLowerCase();
  const filtered: Category[] = q
    ? CATEGORIES.map((cat) => ({
        ...cat,
        emojis: cat.emojis.filter((entry) => entry.k.includes(q)),
      })).filter((cat) => cat.emojis.length > 0)
    : CATEGORIES;

  return (
    <div
      ref={rootRef}
      className="z-[80] w-[320px] rounded-md border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-[#202020]"
      role="dialog"
      aria-label="Choose icon"
    >
      <div className="border-b border-zinc-200 p-2 dark:border-zinc-700">
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search emoji…"
          className="w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-[#191919] dark:text-zinc-100 dark:placeholder:text-zinc-500"
        />
      </div>
      <div className="max-h-72 overflow-auto p-2">
        {filtered.length === 0 && (
          <div className="px-2 py-6 text-center text-sm text-zinc-500">No results.</div>
        )}
        {filtered.map((cat) => (
          <div key={cat.name} className="mb-2">
            <div className="px-1 pb-1 text-[10px] uppercase tracking-wider text-zinc-500">
              {cat.name}
            </div>
            <div className="grid grid-cols-8 gap-0.5">
              {cat.emojis.map((entry) => (
                <button
                  key={entry.e}
                  type="button"
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded text-xl transition hover:bg-zinc-100 dark:hover:bg-zinc-800',
                    current === entry.e && 'bg-zinc-100 ring-1 ring-blue-500 dark:bg-zinc-800',
                  )}
                  onClick={() => onSelect(entry.e)}
                  aria-label={entry.k}
                >
                  {entry.e}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
