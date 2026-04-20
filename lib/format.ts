/**
 * Canonical dollar formatter for UI display.
 *
 * Product decision: show raw dollar amounts with thousand separators — no K/M/B
 * abbreviations. Citizens verifying claims against FEC need exact figures.
 *
 *   formatDollars(2387499)  -> "$2,387,499"
 *   formatDollars(6721527)  -> "$6,721,527"
 *   formatDollars(-50)      -> "-$50"
 *   formatDollars(undefined)-> "$0"
 */
export function formatDollars(amount: number | null | undefined): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '$0';
  const rounded = Math.round(n);
  const sign = rounded < 0 ? '-' : '';
  return `${sign}$${Math.abs(rounded).toLocaleString('en-US')}`;
}
