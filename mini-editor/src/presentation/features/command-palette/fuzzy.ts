/**
 * Tiny subsequence fuzzy matcher for the command palette.
 * Returns a score (higher = better) or -1 when the query does not match.
 *
 * Scoring favours:
 *   - contiguous runs of matched characters
 *   - matches at word boundaries / start of string
 * An empty query matches everything with score 0.
 */
export function fuzzyScore(query: string, target: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const t = target.toLowerCase();

  let score = 0;
  let qi = 0;
  let prevMatchIdx = -2;

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] !== q[qi]) continue;

    // Base point for a match.
    score += 1;
    // Bonus for contiguous matches.
    if (ti === prevMatchIdx + 1) score += 5;
    // Bonus for matching at the very start or after a word boundary.
    if (ti === 0 || /[\s\-_/:]/.test(t[ti - 1])) score += 3;

    prevMatchIdx = ti;
    qi++;
  }

  if (qi < q.length) return -1; // not all query chars consumed
  // Prefer shorter targets when scores tie.
  return score - target.length * 0.01;
}
