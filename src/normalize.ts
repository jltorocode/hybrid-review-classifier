/**
 * Lowercases and strips accents one UTF-16 unit at a time, so every offset in
 * the folded text is also a valid offset in the original. That is what lets
 * the evidence point at the exact words the player wrote ("buenísimo", not
 * "buenisimo").
 */
export function fold(text: string): string {
  let out = '';
  for (const unit of text.split('')) {
    if (unit === '’' || unit === '‘' || unit === '`') {
      out += "'";
      continue;
    }
    const lower = unit.toLowerCase();
    const base = lower.normalize('NFD')[0];
    out += lower.length === 1 && base !== undefined ? base : unit;
  }
  return out;
}

export interface Clause {
  start: number;
  end: number;
  /** The clause follows a contrast word ("but", "pero"): what comes after weighs more. */
  afterContrast: boolean;
  /** Another clause in the same sentence follows a contrast word: this one weighs less. */
  beforeContrast: boolean;
  /** The clause ends with a question mark. */
  isQuestion: boolean;
}

const SENTENCE_END = /[.!?¡¿;\n]+|,|:|\s[-–—]\s/gu;

/**
 * Splits text into clauses at punctuation and at contrast words. The contrast
 * word itself is not part of either clause.
 */
export function splitClauses(folded: string, contrastWords: readonly string[]): Clause[] {
  const contrast = contrastWords.length
    ? new RegExp(`(?<![\\p{L}\\p{N}])(?:${contrastWords.map(escapeRegex).join('|')})(?![\\p{L}\\p{N}])`, 'gu')
    : null;

  const cuts: { start: number; end: number; kind: 'punct' | 'contrast'; question: boolean; sentenceEnd: boolean }[] = [];
  for (const match of folded.matchAll(SENTENCE_END)) {
    const raw = match[0];
    cuts.push({
      start: match.index,
      end: match.index + raw.length,
      kind: 'punct',
      question: raw.includes('?'),
      sentenceEnd: /[.!?;\n]/u.test(raw),
    });
  }
  if (contrast) {
    for (const match of folded.matchAll(contrast)) {
      cuts.push({ start: match.index, end: match.index + match[0].length, kind: 'contrast', question: false, sentenceEnd: false });
    }
  }
  cuts.sort((a, b) => a.start - b.start);

  const clauses: Clause[] = [];
  let cursor = 0;
  let afterContrast = false;
  let sentenceStartIndex = 0;
  for (const cut of cuts) {
    if (cut.start < cursor) continue;
    if (cut.start > cursor && folded.slice(cursor, cut.start).trim()) {
      clauses.push({ start: cursor, end: cut.start, afterContrast, beforeContrast: false, isQuestion: cut.question });
    } else if (cut.question && clauses.length > 0) {
      clauses[clauses.length - 1]!.isQuestion = true;
    }
    if (cut.kind === 'contrast') {
      for (let i = sentenceStartIndex; i < clauses.length; i++) {
        if (!clauses[i]!.afterContrast) clauses[i]!.beforeContrast = true;
      }
      afterContrast = true;
    } else if (cut.sentenceEnd) {
      afterContrast = false;
      sentenceStartIndex = clauses.length;
    }
    cursor = cut.end;
  }
  if (cursor < folded.length && folded.slice(cursor).trim()) {
    clauses.push({ start: cursor, end: folded.length, afterContrast, beforeContrast: false, isQuestion: false });
  }
  return clauses;
}

/** Words (letters, digits and apostrophes) with their positions. */
export function tokens(text: string, offset = 0): { word: string; start: number; end: number }[] {
  return [...text.matchAll(/[\p{L}\p{N}']+/gu)].map((m) => ({
    word: m[0],
    start: offset + m.index,
    end: offset + m.index + m[0].length,
  }));
}

export function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
