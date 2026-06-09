/**
 * Text color & highlight palette for the inline formatting toolbar.
 *
 * Values are concrete CSS colors (not theme tokens) so they round-trip through
 * the stored HTML and render identically in the read-only public viewer, which
 * doesn't load the app's Tailwind theme. Colors are chosen to stay legible on
 * both light and dark backgrounds.
 */

export interface Swatch {
  name: string;
  /** CSS color value, or null for "default" (removes the mark). */
  value: string | null;
}

export const TEXT_COLORS: Swatch[] = [
  { name: 'Default', value: null },
  { name: 'Gray', value: '#9b9a97' },
  { name: 'Brown', value: '#ba856f' },
  { name: 'Orange', value: '#d9730d' },
  { name: 'Yellow', value: '#dfab01' },
  { name: 'Green', value: '#4dab9a' },
  { name: 'Blue', value: '#529cca' },
  { name: 'Purple', value: '#9a6dd7' },
  { name: 'Pink', value: '#e255a1' },
  { name: 'Red', value: '#ff7369' },
];

export const HIGHLIGHT_COLORS: Swatch[] = [
  { name: 'None', value: null },
  { name: 'Gray', value: 'rgba(155,154,151,0.4)' },
  { name: 'Brown', value: 'rgba(186,133,111,0.4)' },
  { name: 'Orange', value: 'rgba(217,115,13,0.4)' },
  { name: 'Yellow', value: 'rgba(223,171,1,0.4)' },
  { name: 'Green', value: 'rgba(77,171,154,0.4)' },
  { name: 'Blue', value: 'rgba(82,156,202,0.4)' },
  { name: 'Purple', value: 'rgba(154,109,215,0.4)' },
  { name: 'Pink', value: 'rgba(226,85,161,0.4)' },
  { name: 'Red', value: 'rgba(255,115,105,0.4)' },
];
