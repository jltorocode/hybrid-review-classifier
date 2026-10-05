import type { Category } from '../types';

/** A term counts towards a category, a tone, or both. */
export interface Term {
  /** Folded (lowercase, no accents). A trailing `*` matches any word ending: `crash*`. */
  phrase: string;
  category: Category | null;
  /** -3 (very negative) to +3 (very positive). */
  tone: number;
  /** Bugs, complaints and toxic terms that make a comment urgent on their own. */
  severity?: 'high' | 'medium';
}

export interface Lexicon {
  language: string;
  terms: Term[];
  /** Words that flip the meaning of a term right after them: "no bugs", "sin lag". */
  negators: string[];
  /** Words that make the next term stronger: "very", "muy", "re". */
  intensifiers: string[];
  /** Words after which the rest of the sentence weighs more: "but", "pero". */
  contrast: string[];
  /** Praise after these weighs less: "at least the music…". */
  concession: string[];
  /** Words that lower a bug's severity: "crashed once". */
  mitigators: string[];
  /** Praise in a clause with these is a wish, not praise: "would be perfect with co-op". */
  hypothetical: string[];
  /** First words of a question: "how", "is there", "cómo". */
  questionStarters: string[];
  /** Very common words, used only to tell languages apart. */
  stopwords: string[];
}

/** Builds terms that share a category, tone and severity. */
export function terms(
  category: Category | null,
  tone: number,
  phrases: string[],
  severity?: Term['severity'],
): Term[] {
  return phrases.map((phrase) => ({ phrase, category, tone, ...(severity ? { severity } : {}) }));
}
