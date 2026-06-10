import type { AiAction } from '@/services/ai.api';

export interface AiActionDef {
  id: AiAction;
  label: string;
  icon: string;
  /** Prompt the user for a value before running (tone / language / custom). */
  input?: { key: 'tone' | 'language' | 'instruction'; placeholder: string };
}

/** Actions offered when text is selected ("Ask AI"). Order = menu order. */
export const SELECTION_ACTIONS: AiActionDef[] = [
  { id: 'improve', label: 'Improve writing', icon: '✨' },
  { id: 'summarize', label: 'Summarize', icon: '📝' },
  { id: 'continue', label: 'Continue writing', icon: '➡️' },
  { id: 'shorter', label: 'Make shorter', icon: '✂️' },
  { id: 'longer', label: 'Make longer', icon: '📖' },
  { id: 'brainstorm', label: 'Brainstorm ideas', icon: '💡' },
  {
    id: 'tone',
    label: 'Change tone…',
    icon: '🎭',
    input: { key: 'tone', placeholder: 'e.g. professional, friendly, confident' },
  },
  {
    id: 'translate',
    label: 'Translate…',
    icon: '🌐',
    input: { key: 'language', placeholder: 'e.g. Spanish, Hindi, French' },
  },
  {
    id: 'custom',
    label: 'Custom instruction…',
    icon: '⌨️',
    input: { key: 'instruction', placeholder: 'Tell AI what to do with the selection' },
  },
];
