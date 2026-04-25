/**
 * Pure presentation helpers shared by SearchBar (sm:+ inline dropdown) and
 * SearchOverlay (full-screen base overlay). No JSX, no React — Tailwind class
 * strings and CSS-var color tokens only. Keeps the two render paths in sync
 * so the result-row visuals remain identical between mobile and desktop.
 */

export function getPartyColor(party: string): string {
  switch (party) {
    case 'Republican':
      return '#dc2626';
    case 'Democrat':
      return '#2563eb';
    default:
      return '#6b7280';
  }
}

export function getPartyLabel(party: string): string {
  switch (party) {
    case 'Republican':
      return 'R';
    case 'Democrat':
      return 'D';
    case 'Independent':
      return 'I';
    default:
      return party.charAt(0);
  }
}

export function getLevelLabel(officeLevel: string): string {
  if (officeLevel.startsWith('US ')) return 'FED';
  if (officeLevel.startsWith('State ') || officeLevel === 'Governor') return 'STATE';
  return 'LOCAL';
}

export function getLevelColor(officeLevel: string): string {
  if (officeLevel.startsWith('US ')) return 'var(--terminal-red)';
  if (officeLevel.startsWith('State ') || officeLevel === 'Governor')
    return 'var(--terminal-amber)';
  return 'var(--terminal-blue)';
}

/**
 * Color used for the corruption score in the result row's right-hand column.
 * 60+ → red, 40+ → amber, else green. Mirrors the legend used elsewhere.
 */
export function getCorruptionScoreColor(score: number): string {
  if (score >= 60) return 'var(--terminal-red)';
  if (score >= 40) return 'var(--terminal-amber)';
  return 'var(--terminal-green)';
}

/**
 * Simple fuzzy match: checks if all characters of the query appear in order
 * within the target string (case-insensitive). Returns a score (lower = better
 * match). -1 means no match. Currently retained for parity with the original
 * SearchBar implementation; the API endpoint does the actual filtering, but
 * client-side rescoring is supported if needed.
 */
export function fuzzyMatch(query: string, target: string): number {
  const q = query.toLowerCase();
  const t = target.toLowerCase();

  // Exact substring match gets best score
  const substringIdx = t.indexOf(q);
  if (substringIdx !== -1) {
    if (substringIdx === 0 || t[substringIdx - 1] === ' ') {
      return 0;
    }
    return 1;
  }

  // Fuzzy: all query chars appear in order
  let qi = 0;
  let gaps = 0;
  let lastMatchIdx = -1;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      if (lastMatchIdx !== -1 && ti - lastMatchIdx > 1) {
        gaps += ti - lastMatchIdx - 1;
      }
      lastMatchIdx = ti;
      qi++;
    }
  }

  if (qi === q.length) {
    return 2 + gaps;
  }

  return -1;
}
