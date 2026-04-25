import type { Config } from 'tailwindcss'

/**
 * Tailwind CSS 4 configuration for Snitched.ai.
 *
 * Tailwind 4 supports both CSS-first (@theme in globals-terminal.css) and JS
 * config. This file pairs with the `@import "tailwindcss"` directive in
 * `app/globals-terminal.css`. We register the project's existing `--terminal-*`
 * CSS custom properties as theme color aliases so utility classes like
 * `bg-terminal-green`, `text-terminal-amber`, `border-terminal-border`, etc.
 * resolve at build time.
 *
 * See:
 *  - .planning/phases/10-mobile-redesign/UI-SPEC.md §12 (token spec)
 *  - .planning/phases/10-mobile-redesign/PLAN-spec.md "Phase A"
 */
const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        'terminal-green': 'var(--terminal-green)',
        'terminal-amber': 'var(--terminal-amber)',
        'terminal-text': 'var(--terminal-text)',
        'terminal-text-dim': 'var(--terminal-text-dim)',
        'terminal-border': 'var(--terminal-border)',
      },
    },
  },
  plugins: [],
}

export default config
