export const SENTIMENTS = ['positive', 'neutral', 'negative'] as const;
export const CATEGORIES = [
  'bug',
  'question',
  'praise',
  'suggestion',
  'complaint',
  'spam',
  'toxic',
  'other',
] as const;
export const PRIORITIES = ['high', 'medium', 'low'] as const;

export type Sentiment = (typeof SENTIMENTS)[number];
export type Category = (typeof CATEGORIES)[number];
export type Priority = (typeof PRIORITIES)[number];

/** ISO 639-1 code. The rules detect `en` and `es`; anything else is `und` until Claude looks at it. */
export type Language = string;

/** Who produced a classification. A `manual` one is never overwritten. */
export type ClassifiedBy = 'rules' | 'ai' | 'manual';

export interface Review {
  id: string;
  text: string;
  /** Where the comment came from: steam, youtube, discord… Only used as context. */
  source?: string;
  /** Steam's thumbs up / down. `null` or missing when the platform has none. */
  recommended?: boolean | null;
  /** Steam's "helpful" votes. Negative reviews with many votes are the ones shoppers read. */
  helpfulVotes?: number;
}

/** A piece of the original text that supports a decision. Offsets index into `Review.text`. */
export interface Evidence {
  start: number;
  end: number;
  text: string;
  /** What the evidence points to: a category, or `positive` / `negative` for tone only. */
  signal: Category | 'positive' | 'negative';
}

export interface Classification {
  id: string;
  sentiment: Sentiment;
  category: Category;
  priority: Priority;
  language: Language;
  /** 0 to 1. Below the refine threshold, Claude gets a look (with `--ai`). */
  confidence: number;
  classifiedBy: ClassifiedBy;
  /** Short, human-readable explanations of the decision. */
  reasons: string[];
  evidence: Evidence[];
}
