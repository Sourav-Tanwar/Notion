/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Surfaces
        canvas: 'var(--bg-canvas)',
        surface: 'var(--bg-surface)',
        sidebar: 'var(--bg-sidebar)',
        overlay: 'var(--bg-overlay)',

        // Foreground levels
        primary: 'var(--text-primary)',
        secondary: 'var(--text-secondary)',
        muted: 'var(--text-muted)',
        faint: 'var(--text-faint)',

        // Borders — kept `border` as the default so existing `border-border`
        // utilities continue to work after the rename to --border-default.
        border: 'var(--border-default)',
        'border-muted': 'var(--border-muted)',
        'border-strong': 'var(--border-strong)',

        // Brand & status
        accent: 'var(--accent)',
        'accent-hover': 'var(--accent-hover)',
        danger: 'var(--danger)',
        success: 'var(--success)',
        warning: 'var(--warning)',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui'],
        mono: ['JetBrains Mono', 'ui-monospace'],
      },
    },
  },
  plugins: [],
};
