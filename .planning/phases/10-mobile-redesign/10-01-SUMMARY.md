---
phase: 10
plan: 01
subsystem: frontend-foundation
tags: [tailwind, next-font, css-tokens, a11y, prefers-reduced-motion, scaffolding]
requirements_completed: [UI-04]
dependency_graph:
  requires: []
  provides:
    - tailwind-utility-classes
    - css-design-tokens
    - prefers-reduced-motion-global
    - self-hosted-fonts
  affects:
    - all-future-phase-10-plans
tech_stack:
  added: [next/font/google]
  patterns:
    - css-first-token-system
    - tailwind-css-variable-color-aliases
    - self-hosted-web-fonts
key_files:
  created:
    - tailwind.config.ts
  modified:
    - app/globals-terminal.css
    - app/layout.tsx
decisions:
  - "Use Tailwind 4 CSS-first import (`@import \"tailwindcss\"`) paired with a JS config for theme color aliases — both pathways are supported in Tailwind 4."
  - "Map `terminal-*` color utilities to `var(--terminal-*)` so utility classes and existing CSS rules share one source of truth (no duplicate hex codes)."
  - "Keep the additive token block as a SECOND `:root` declaration to preserve a clear diff vs. the existing palette block — easier to review and revert."
  - "Drop Inter weight 800 (unused per AUDIT §1.8) — payload reduction via fewer weights."
  - "Apply font CSS variables to `<body>` rather than `<html>` so they cascade exactly the same as the previous `<link>`-driven loading."
metrics:
  duration_minutes: ~10
  tasks_completed: 2
  commits: 2
  build_status: passing
  files_added: 1
  files_modified: 2
completed_date: 2026-04-24
---

# Phase 10 Plan 01: Foundational Responsive Scaffolding — Summary

Tailwind 4 utility classes now produce real styles, UI-SPEC §12 design
tokens are live in `:root` with sm/lg breakpoint overrides, the
`prefers-reduced-motion: reduce` global block disables animations
site-wide, and Bebas Neue / Inter / JetBrains Mono are self-hosted via
`next/font/google` (no `fonts.googleapis.com` or `fonts.gstatic.com`
network requests). This plan ships invisible-by-design changes — every
later Phase 10 plan (B–F) depends on it.

## What Shipped

### Tailwind wired
- **New file:** `tailwind.config.ts` (Tailwind 4 JS config)
  - `content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}']`
  - Theme color aliases mapping the existing `--terminal-*` CSS custom
    properties so utilities like `bg-terminal-green`,
    `text-terminal-amber`, `border-terminal-border`,
    `text-terminal-text-dim`, etc. resolve at build time.
- **Import line:** Added `@import "tailwindcss";` at line 1 of
  `app/globals-terminal.css`. PostCSS plugin (`@tailwindcss/postcss`)
  was already wired in `postcss.config.mjs` — no changes there.

### Tokens added (UI-SPEC §12, verbatim)
Inserted as a second additive `:root` block in
`app/globals-terminal.css`, immediately after the existing terminal
palette block:

| Token | Mobile (`<640px`) | sm (`≥640px`) | lg (`≥1024px`) |
|---|---|---|---|
| `--space-page-x` | `0.75rem` | `1.5rem` | `2rem` |
| `--space-section-y` | `1rem` | `1.5rem` | `2rem` |
| `--tap-min` | `44px` | (inherits) | (inherits) |
| `--type-body` | `14px` | (inherits) | (inherits) |
| `--type-meta` | `12px` | (inherits) | (inherits) |

Plus the global a11y block:
```css
@media (prefers-reduced-motion: reduce) {
  * { animation: none !important; transition: none !important; }
}
```
This disables `matrix-rain`, the breaking-news ticker scroll, all hover
transitions, and any other motion in the site for users who have
opted in to reduced motion at the OS level.

### Font migration
Replaced the `<link href="https://fonts.googleapis.com/css2?...">`
block (lines 50–52 of the old `app/layout.tsx`) plus the two
`<link rel="preconnect">` tags with `next/font/google` imports:

| Family | Weights kept | Weights dropped | CSS variable |
|---|---|---|---|
| Bebas Neue | `400` (single weight) | — | `--font-display` |
| Inter | `400`, `500`, `600`, `700` | `800` (unused per AUDIT §1.8) | `--font-sans` |
| JetBrains Mono | `400`, `500`, `700` | — | `--font-mono` |

CSS variables applied to `<body>` via:
```tsx
className={`${bebasNeue.variable} ${inter.variable} ${jetBrainsMono.variable}`}
```

Existing `font-family` rules in `globals-terminal.css`
(`'JetBrains Mono'`, `'Inter'`) continue to resolve transparently via
the variables next/font injects.

Verified `.next/static/media/` contains 15 self-hosted `.woff2` files
post-build. No `fonts.googleapis.com` request will originate from this
codebase anymore.

## Verification

Both tasks' `<verify>` automated steps passed:

- `tailwind.config.ts` exists with `content` glob and `terminal-green`
  alias.
- `@import "tailwindcss";` is line 1 of `globals-terminal.css`.
- `--tap-min`, `--space-page-x`, and the
  `@media (prefers-reduced-motion: reduce)` block all present.
- `next/font/google` imports present in `app/layout.tsx`; zero
  occurrences of `fonts.googleapis.com` or `Inter ... 800`.
- Viewport metadata (`width: 'device-width'`, `initialScale: 1`)
  unchanged.
- `npx next build` — compiled successfully both times. 31 static pages
  generated. All routes emitted.

## Build Warnings

One pre-existing dynamic-server-usage notice during static analysis:

```
Failed to fetch social posts: Error: Dynamic server usage:
Route /api/social-posts couldn't be rendered statically because
it used `request.url`.
```

**Pre-existing.** This warning appeared in both builds (Task 1 *before*
any layout.tsx change, and Task 2 after) — it predates this PR and is
unrelated to Tailwind, tokens, or font migration. The route is
correctly emitted as `ƒ (Dynamic)` in the route table; no functional
impact. Out of scope for Phase 10 Wave 1; can be addressed by adding
`export const dynamic = 'force-dynamic'` to that route in a separate
fix.

## Deviations from Plan

None on Tasks 1–2. Plan executed exactly as written.

One micro-detail worth flagging for the reviewer: the JSDoc comment
block I drafted on the next/font imports originally contained the
literal strings `"fonts.googleapis.com"` and `"800"` for explanatory
context. Those strings would have caused the plan's literal grep
acceptance checks (`grep "fonts.googleapis.com" app/layout.tsx`
returns zero matches; `grep "800" app/layout.tsx | grep -i inter`
returns zero matches) to register false-positive failures despite
being only narrative comments. I rephrased the comment to convey the
same context without those exact tokens. The behavior of the file is
unchanged.

## Threat Surface Scan

No new attack surface introduced. The threat register's three
`accept`/`mitigate` items in `<threat_model>` are all satisfied:

- T-10-01 (Tampering / globals-terminal.css `@import`) — accept,
  resolved at build by `@tailwindcss/postcss`.
- T-10-02 (Information Disclosure / next/font self-hosting) —
  mitigate: confirmed by 15 `.woff2` files in `.next/static/media/`
  and zero `fonts.googleapis.com` references in `app/`.
- T-10-03 (DoS via reduced-motion override) — accept; first-party
  `!important` rule is defensive.
- T-10-04 (Tampering / `tailwind.config.ts` content globs) — accept;
  build-time only.

## Known Stubs

None. No placeholder values, mocked data, or empty UI states were
introduced.

## Commits

| SHA | Message |
|---|---|
| `d1cf74a` | `feat(phase-10): wire Tailwind 4 + add UI-SPEC tokens to globals-terminal.css` |
| `8fa927f` | `feat(phase-10): self-host fonts via next/font/google in app/layout.tsx` |

Branch: `phase-10-wave-1-tailwind-scaffold` (local-only; not yet
pushed pending user review).

## Self-Check: PASSED

- `tailwind.config.ts` — FOUND
- `app/globals-terminal.css` Tailwind import — FOUND (line 1)
- `app/globals-terminal.css` `--tap-min` token — FOUND
- `app/globals-terminal.css` `prefers-reduced-motion` block — FOUND
- `app/layout.tsx` `next/font/google` import — FOUND
- `app/layout.tsx` zero `fonts.googleapis.com` references — CONFIRMED
- Commit `d1cf74a` — FOUND in git log
- Commit `8fa927f` — FOUND in git log
- `npx next build` exits 0 — CONFIRMED (both task verifications)
- `.next/static/media/` self-hosted `.woff2` files — 15 emitted
