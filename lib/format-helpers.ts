/**
 * Centralized formatting and color helper functions.
 * Extracted from duplicated implementations across multiple pages.
 */

/** Map a corruption score (0-100) to a display color. */
export function getScoreColor(score: number): string {
  if (score <= 20) return '#10b981';
  if (score <= 40) return '#22c55e';
  if (score <= 60) return '#f59e0b';
  if (score <= 80) return '#ef4444';
  return '#dc2626';
}

/** Map a letter grade to a display color. */
export function getGradeColor(grade: string): string {
  switch (grade) {
    case 'A': return '#10b981';
    case 'B': return '#22c55e';
    case 'C': return '#f59e0b';
    case 'D': return '#ef4444';
    case 'F': return '#dc2626';
    default: return '#6b7280';
  }
}

/** Format a dollar amount as a compact string like "$1.2M" or "$500K". */
export function formatCurrency(amount: number): string {
  if (amount >= 1_000_000) {
    return `$${(amount / 1_000_000).toFixed(1)}M`;
  }
  if (amount >= 1_000) {
    return `$${(amount / 1_000).toFixed(0)}K`;
  }
  return `$${amount.toLocaleString()}`;
}

/** Format a number with comma separators. */
export function formatNumber(n: number): string {
  return n.toLocaleString();
}
