import { LEXICONS } from './lexicon';
import { fold, tokens } from './normalize';

const STOPWORDS = new Map(LEXICONS.map((lexicon) => [lexicon.language, new Set(lexicon.stopwords)]));

/** Letters that give a language away on their own. */
const TELLS: Record<string, RegExp[]> = {
  es: [/[ñ¿¡]/u, /[áéíóú]/u, /(?<![\p{L}])(?:ja){2,}/iu, /(?<![\p{L}])(?:xd|wn|weon|po|cachai)(?![\p{L}])/iu],
  en: [/\b\w+n't\b/iu, /\b\w+'(?:s|re|ve|ll|d)\b/iu, /\b(?:lol|lmao|tbh|imo|idk)\b/iu],
};

/** Scripts the rules don't cover: the comment goes to Claude as "und". */
const OTHER_SCRIPT = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Cyrillic}\p{Script=Arabic}\p{Script=Greek}\p{Script=Thai}\p{Script=Hebrew}]/u;

/**
 * Tells English from Spanish with common words plus a few telltale letters.
 * Returns `und` when there is too little text or the evidence is tied.
 */
export function detectLanguage(text: string, folded = fold(text)): string {
  if (OTHER_SCRIPT.test(text)) return 'und';
  const words = tokens(folded).map((t) => t.word);
  const scores = new Map<string, number>();
  for (const [language, stopwords] of STOPWORDS) {
    let score = 0;
    for (const word of words) if (stopwords.has(word)) score += 1;
    for (const tell of TELLS[language] ?? []) if (tell.test(text)) score += 1.5;
    scores.set(language, score);
  }
  const ranked = [...scores].sort((a, b) => b[1] - a[1]);
  const [best, second] = ranked;
  if (!best || best[1] === 0 || (second && best[1] === second[1])) return 'und';
  return best[0];
}
