import type { Category, Classification, Priority, Sentiment } from './types';

/** A person's fix for one comment. Whatever they set wins over rules and AI, forever. */
export interface Correction {
  id: string;
  sentiment?: Sentiment;
  category?: Category;
  priority?: Priority;
}

/** Applies human corrections on top of automatic results and marks them `manual`. */
export function applyCorrections(results: Classification[], corrections: readonly Correction[]): Classification[] {
  const byId = new Map(corrections.map((c) => [c.id, c]));
  return results.map((result) => {
    const fix = byId.get(result.id);
    if (!fix) return result;
    return {
      ...result,
      ...(fix.sentiment ? { sentiment: fix.sentiment } : {}),
      ...(fix.category ? { category: fix.category } : {}),
      ...(fix.priority ? { priority: fix.priority } : {}),
      confidence: 1,
      classifiedBy: 'manual',
      reasons: ['corrected by a person', ...result.reasons],
    };
  });
}

/**
 * Picks what to store when a new automatic result arrives for a comment that
 * already has one. A manual correction is never overwritten.
 */
export function keepManual(current: Classification | undefined, incoming: Classification): Classification {
  return current?.classifiedBy === 'manual' ? current : incoming;
}
