import { escapeRegex } from '../normalize';
import { en } from './en';
import { es } from './es';
import type { Lexicon, Term } from './types';

export type { Lexicon, Term } from './types';

export const LEXICONS: readonly Lexicon[] = [en, es];

export interface CompiledTerm extends Term {
  language: string;
  regex: RegExp;
}

/**
 * `crash*` matches "crash", "crashes", "crashing"; spaces match any whitespace.
 * A hyphen counts as part of a word, so "mid" does not match "mid-race".
 */
export function compilePhrase(phrase: string, flags = 'gu'): RegExp {
  const words = phrase.split(' ').map((word) =>
    word.length > 1 && word.endsWith('*')
      ? `${escapeRegex(word.slice(0, -1))}[\\p{L}\\p{N}']*`
      : escapeRegex(word),
  );
  return new RegExp(`(?<![\\p{L}\\p{N}-])${words.join('\\s+')}(?![\\p{L}\\p{N}-])`, flags);
}

export const TERMS: readonly CompiledTerm[] = LEXICONS.flatMap((lexicon) =>
  lexicon.terms.map((term) => ({ ...term, language: lexicon.language, regex: compilePhrase(term.phrase) })),
);

/** Function words from every language, merged: mixed-language comments are common. */
const merge = (pick: (lexicon: Lexicon) => string[]) => [...new Set(LEXICONS.flatMap(pick))];

export const WORDS = {
  negators: new Set(merge((l) => l.negators)),
  intensifiers: merge((l) => l.intensifiers),
  contrast: merge((l) => l.contrast),
  // Without the `g` flag: these are only tested, and a global regex keeps state between tests.
  concession: merge((l) => l.concession).map((p) => compilePhrase(p, 'u')),
  mitigators: merge((l) => l.mitigators).map((p) => compilePhrase(p, 'u')),
  hypothetical: merge((l) => l.hypothetical).map((p) => compilePhrase(p, 'u')),
  questionStarters: merge((l) => l.questionStarters),
};
