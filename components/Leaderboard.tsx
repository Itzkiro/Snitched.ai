'use client';

import type { ReactNode } from 'react';

/**
 * Leaderboard mobile slot semantics:
 *  - 'primary'   — the section's headline metric. Rendered as a large number
 *                  (text-2xl, terminal-green) in the top-right of the mobile card.
 *                  EXACTLY ONE column per Leaderboard usage carries this slot.
 *  - 'secondary' — supporting metrics. Rendered as label/value rows in the body
 *                  of the mobile card.
 *  - 'meta'      — footer-line content (e.g. action buttons, badges). Rendered
 *                  in a divided footer below the secondary stack.
 *  - 'hidden'    — not rendered at base. Only appears in the lg: table.
 *
 * Two columns are handled specially and never carry a `mobileSlot: 'primary'`:
 *  - the rank column (60px wide on lg:) — rendered in the top-left corner of the card.
 *    Pass `rankRender` to control rendering.
 *  - the name column — rendered as the row title above the primary slot. Identify
 *    it by setting `isName: true` on its column descriptor.
 */
export type MobileSlot = 'primary' | 'secondary' | 'meta' | 'hidden';

export interface LeaderboardColumn<T> {
  /** Stable key for React lists and the lg: header label. */
  key: string;
  /** Header text for the lg: CSS-grid table header row. */
  header: string;
  /** Renders the cell content for one row. */
  render: (row: T) => ReactNode;
  /** Where the column appears in the mobile card layout. Defaults to 'secondary'. */
  mobileSlot?: MobileSlot;
  /**
   * Tailwind grid-template-column track size for lg: (e.g. '60px', '1fr', '100px').
   * Defaults to '1fr'. Used to keep the desktop CSS-grid table byte-equivalent
   * to the previous hand-rolled markup.
   */
  widthLg?: string;
  /** Optional className applied to both the header and data cells at lg:. */
  cellClassName?: string;
  /** Optional label override for the secondary-slot label at base. Defaults to header. */
  mobileLabel?: string;
  /** Mark the row's identity column. Renders as the card title at base. */
  isName?: boolean;
}

export interface LeaderboardProps<T> {
  rows: T[];
  columns: LeaderboardColumn<T>[];
  /** Future-proofing: only 'card' is supported in v1. */
  mobileLayout: 'card';
  /** Required — provides stable React keys for both lg: and base renderings. */
  getRowKey: (row: T) => string;
  /** Optional rank renderer. If provided, used instead of the rank column's `render`. */
  rankRender?: (row: T, index: number) => ReactNode;
  /** Optional className for the outer wrapper. */
  className?: string;
}

/**
 * Reusable leaderboard component:
 *  - At base: renders a card stack (data-leaderboard-mobile attribute on the wrapper
 *    enables Playwright instrumentation in plan 10-06).
 *  - At lg: renders a true CSS-grid table with column widths from `widthLg`.
 *
 * UI-SPEC §7 strategy A. See plan 10-04 for usage requirements (each Leaderboard
 * usage MUST have exactly one column tagged `mobileSlot: 'primary'`).
 */
export default function Leaderboard<T>({
  rows,
  columns,
  getRowKey,
  rankRender,
  className,
}: LeaderboardProps<T>) {
  // Identify special columns
  const rankCol = columns.find((c) => c.key === 'rank');
  const nameCol = columns.find((c) => c.isName);
  const primaryCol = columns.find((c) => c.mobileSlot === 'primary');
  const secondaryCols = columns.filter(
    (c) => c.mobileSlot === 'secondary' && !c.isName && c.key !== 'rank'
  );
  const metaCols = columns.filter((c) => c.mobileSlot === 'meta');

  const gridTemplateColumns = columns
    .map((c) => c.widthLg ?? '1fr')
    .join(' ');

  return (
    <div className={className}>
      {/* Desktop: CSS-grid table */}
      <div
        className="hidden lg:grid lg:gap-x-2"
        style={{ gridTemplateColumns }}
      >
        {/* Header row */}
        {columns.map((c) => (
          <div
            key={`h-${c.key}`}
            className={`text-xs font-mono uppercase text-terminal-text-dim px-2 py-2 tracking-wider ${c.cellClassName ?? ''}`}
          >
            {c.header}
          </div>
        ))}
        {/* Data rows */}
        {rows.map((row, i) => (
          <div
            key={`row-${getRowKey(row)}`}
            className="contents"
          >
            {columns.map((c) => (
              <div
                key={`cell-${getRowKey(row)}-${c.key}`}
                className={`px-2 py-3 font-mono text-sm text-terminal-text border-t border-terminal-border whitespace-nowrap ${c.cellClassName ?? ''}`}
              >
                {c.key === 'rank' && rankRender ? rankRender(row, i) : c.render(row)}
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Mobile: card stack */}
      <div
        data-leaderboard-mobile
        className="flex flex-col gap-3 lg:hidden"
      >
        {rows.map((row, i) => (
          <div
            key={`card-${getRowKey(row)}`}
            className="border border-terminal-border bg-black/40 p-3 flex flex-col gap-2"
          >
            {/* Top row: rank + name (left) + primary (right) */}
            <div className="flex items-baseline justify-between gap-3">
              <div className="flex flex-col gap-1 min-w-0">
                {rankCol && (
                  <div className="text-terminal-text-dim font-mono text-xs">
                    {rankRender ? rankRender(row, i) : rankCol.render(row)}
                  </div>
                )}
                {nameCol && (
                  <div className="font-mono text-sm font-bold text-terminal-text break-words">
                    {nameCol.render(row)}
                  </div>
                )}
              </div>
              {primaryCol && (
                <div className="font-mono font-bold text-2xl text-terminal-green text-right shrink-0 break-words">
                  {primaryCol.render(row)}
                </div>
              )}
            </div>

            {/* Secondary slots: label/value pairs */}
            {secondaryCols.length > 0 && (
              <div className="flex flex-col gap-1">
                {secondaryCols.map((c) => (
                  <div
                    key={`sec-${getRowKey(row)}-${c.key}`}
                    className="flex justify-between items-baseline gap-2 text-xs font-mono"
                  >
                    <span className="text-terminal-text-dim uppercase tracking-wider shrink-0">
                      {c.mobileLabel ?? c.header}
                    </span>
                    <span className="text-terminal-text break-words text-right">
                      {c.render(row)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Meta slot: footer */}
            {metaCols.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-terminal-text-dim border-t border-terminal-border/50 pt-2">
                {metaCols.map((c) => (
                  <div key={`meta-${getRowKey(row)}-${c.key}`}>
                    {c.render(row)}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
