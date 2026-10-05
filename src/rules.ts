import { detectLanguage } from './language';
import { TERMS, WORDS } from './lexicon';
import { type Clause, fold, splitClauses, tokens } from './normalize';
import { findPatterns } from './patterns';
import type { Category, Classification, Evidence, Priority, Review, Sentiment } from './types';

/** Bump it when the rules change, so stored results from older rules can be reclassified. */
export const RULES_VERSION = 1;

/** Steam shows negative reviews with this many "helpful" votes near the top of the store page. */
export const VISIBLE_REVIEW_VOTES = 20;

/** Below this, the rules are not sure enough and Claude gets a look (with `--ai`). */
export const REFINE_THRESHOLD = 0.6;

interface Hit {
  start: number;
  end: number;
  category: Category | null;
  tone: number;
  weight: number;
  severity?: 'high' | 'medium';
  label: string;
  /** Found by shape (a score, a link, price per hour) rather than by a word list. */
  pattern?: boolean;
  note?: string;
}

/** Bug words that say nothing about the symptom. */
const GENERIC_BUG_WORDS = new Set(['bug*', 'buggy', 'glitch*', 'error', 'errors', 'errores', 'bugea*', 'buguea*', 'bugeado', 'bugueado', 'buggeado']);

const BASE_WEIGHT: Record<Category, (tone: number) => number> = {
  bug: () => 1,
  question: () => 1.2,
  suggestion: () => 1.3,
  praise: (tone) => 0.6 + 0.2 * Math.abs(tone),
  complaint: (tone) => 0.6 + 0.2 * Math.abs(tone),
  toxic: () => 2,
  spam: () => 2,
  other: () => 0,
};

/** Rules-only classification: no network, deterministic, well under a millisecond per comment. */
export function classifyWithRules(review: Review): Classification {
  const text = review.text ?? '';
  const visible = maskTemplate(text);
  const folded = fold(visible);
  const language = detectLanguage(visible, folded);
  const clauses = splitClauses(folded, WORDS.contrast);
  const reasons: string[] = [];

  const hits = resolveOverlaps(findHits(visible, folded)).map((hit) => applyContext(hit, folded, clauses));

  // Shouting and exclamation marks make the tone stronger, not different.
  const letters = text.replace(/[^\p{L}]/gu, '');
  const shouting = letters.length >= 8 && letters.replace(/[^\p{Lu}]/gu, '').length / letters.length > 0.6;
  const emphasis = (shouting ? 1.3 : 1) * (/!{2,}/.test(text) ? 1.15 : 1);

  const tone = hits.reduce((sum, hit) => sum + hit.tone, 0) * emphasis;
  const compound = tone / Math.sqrt(tone * tone + 8);

  const scores = new Map<Category, number>();
  const add = (category: Category, weight: number) => scores.set(category, (scores.get(category) ?? 0) + weight);
  for (const hit of hits) if (hit.category) add(hit.category, hit.weight);
  if (addQuestionMarks(folded, clauses, hits, add) > 0) reasons.push('question: ends with a question mark');

  // ---- Sentiment, with Steam's thumb when the text actually gives an opinion.
  let recommended = review.recommended ?? null;
  if (recommended !== null && /by mistake|by accident|por error|sin querer|me equivoque/.test(folded)) {
    recommended = !recommended;
    reasons.push('the player says the thumb was a mistake: it is read the other way');
  }
  const opinionated = hits.some((hit) => hit.tone !== 0);
  let score = compound;
  let thumbOverrides = false;
  if (recommended !== null) {
    if (!opinionated) {
      reasons.push('thumb ignored: the text gives no opinion');
    } else if (recommended === false && compound > 0.3) {
      // Praise with a thumbs down is sarcasm, or praise the player doesn't think makes up for the rest.
      thumbOverrides = true;
      score = -0.5;
      const sarcasm = !hits.some((hit) => hit.tone < 0);
      reasons.push(sarcasm ? 'praise with a thumbs down and no complaint: read as sarcasm' : 'positive words, but a thumbs down');
    } else if (recommended === true && compound <= -0.2) {
      score = 0;
      reasons.push('complaints with a thumbs up: a mixed review');
    } else {
      score += recommended ? 0.3 : -0.3;
    }
  }
  let sentiment: Sentiment = score >= 0.2 ? 'positive' : score <= -0.2 ? 'negative' : 'neutral';

  // ---- Category: toxic, spam, bug and question have their own bar; the rest goes by weight.
  if (thumbOverrides) {
    scores.set('complaint', (scores.get('complaint') ?? 0) + (scores.get('praise') ?? 0));
    scores.delete('praise');
  }
  const get = (category: Category) => scores.get(category) ?? 0;
  const opinionMax = Math.max(get('praise'), get('complaint'), get('suggestion') * 1.2);
  let category: Category;
  if (get('toxic') >= 2) category = 'toxic';
  else if (get('spam') >= 2) category = 'spam';
  else if (get('bug') >= 1 && get('bug') >= 0.4 * opinionMax) category = 'bug';
  else if (get('question') >= 1.5 && get('question') >= 0.6 * opinionMax) category = 'question';
  else if (get('question') >= 1 && opinionMax < 0.5) category = 'question';
  else if (opinionMax < 0.5) category = 'other';
  else if (get('suggestion') * 1.2 === opinionMax) category = 'suggestion';
  else if (get('praise') === get('complaint')) category = sentiment === 'negative' ? 'complaint' : 'praise';
  else category = get('praise') > get('complaint') ? 'praise' : 'complaint';

  // Spam says nothing about the game, however many emoji it has.
  if (category === 'spam') sentiment = 'neutral';

  // ---- Priority.
  const severe = hits.some((hit) => hit.severity === 'high' && hit.category === category);
  const complaintCount = hits.filter((hit) => hit.category === 'complaint').length;
  let priority: Priority = 'low';
  if (severe && (category === 'bug' || category === 'toxic')) priority = 'high';
  else if (category === 'bug' || category === 'question' || category === 'toxic') priority = 'medium';
  else if (category === 'complaint' && (complaintCount >= 2 || text.length >= 200)) priority = 'medium';
  if (sentiment === 'negative' && (review.helpfulVotes ?? 0) >= VISIBLE_REVIEW_VOTES && priority !== 'high') {
    priority = priority === 'low' ? 'medium' : 'high';
    reasons.push(`${review.helpfulVotes} helpful votes: one of the reviews shoppers see first`);
  }

  // ---- Confidence: how clearly the winner beats the runner-up, and how much evidence there is.
  const top = category === 'other' ? 0 : get(category);
  const runnerUp = Math.max(0, ...[...scores].filter(([c]) => c !== category).map(([, s]) => s));
  let confidence: number;
  if (hits.length === 0 && top === 0) confidence = 0.3;
  else if (category === 'other') confidence = 0.35;
  else confidence = 0.25 + 0.45 * ((top - runnerUp) / top) + 0.3 * Math.min(top / 2, 1);
  if (language === 'und') confidence *= 0.7;
  confidence = Math.round(Math.max(0, Math.min(1, confidence)) * 100) / 100;

  const evidence: Evidence[] = hits.map((hit) => ({
    start: hit.start,
    end: hit.end,
    text: text.slice(hit.start, hit.end),
    signal: hit.category ?? (hit.tone >= 0 ? 'positive' : 'negative'),
  }));
  for (const hit of hits) {
    const what = hit.category ?? (hit.tone >= 0 ? 'positive' : 'negative');
    const notes = [hit.pattern ? hit.label : '', hit.note ?? ''].filter(Boolean).join('; ');
    reasons.push(`${what}: "${text.slice(hit.start, hit.end)}"${notes ? ` (${notes})` : ''}`);
  }
  if (language === 'und') reasons.push('language not covered by the rules');

  return {
    id: review.id,
    sentiment,
    category,
    priority,
    language,
    confidence,
    classifiedBy: 'rules',
    reasons,
    evidence,
  };
}

function findHits(text: string, folded: string): Hit[] {
  const hits: Hit[] = [];
  for (const term of TERMS) {
    for (const m of folded.matchAll(term.regex)) {
      hits.push({
        start: m.index,
        end: m.index + m[0].length,
        category: term.category,
        tone: term.tone,
        weight: term.category ? BASE_WEIGHT[term.category](term.tone) : 0,
        ...(term.severity ? { severity: term.severity } : {}),
        label: term.phrase,
      });
    }
  }
  for (const pattern of findPatterns(text)) {
    hits.push({
      ...pattern,
      pattern: true,
      weight: pattern.weight ?? (pattern.category ? BASE_WEIGHT[pattern.category](pattern.tone) : 0),
    });
  }
  return hits;
}

/** Where two matches overlap, the longer one wins: "not worth it" beats "worth it". */
function resolveOverlaps(hits: Hit[]): Hit[] {
  const ranked = [...hits].sort(
    (a, b) =>
      b.end - b.start - (a.end - a.start) ||
      Number(b.severity === 'high') - Number(a.severity === 'high') ||
      Math.abs(b.tone) - Math.abs(a.tone),
  );
  const kept: Hit[] = [];
  for (const hit of ranked) {
    if (kept.every((k) => hit.end <= k.start || hit.start >= k.end)) kept.push(hit);
  }
  return kept.sort((a, b) => a.start - b.start);
}

/** Negation, intensifiers, contrast, concession, mitigation and wishes, all within the hit's clause. */
function applyContext(hit: Hit, folded: string, clauses: Clause[]): Hit {
  const clause = clauses.find((c) => hit.start >= c.start && hit.start < c.end);
  if (!clause) return hit;
  const before = folded.slice(clause.start, hit.start);
  const whole = folded.slice(clause.start, clause.end);
  const lastTokens = tokens(before, clause.start).slice(-3);
  const lastWords = lastTokens.map((t) => t.word);
  const result: Hit = { ...hit };
  const notes: string[] = [];

  const negatorToken = lastTokens.find((t) => WORDS.negators.has(t.word));
  const negator = negatorToken?.word;
  if (negatorToken) {
    // The evidence becomes "not bad" instead of "bad".
    result.start = negatorToken.start;
    if (hit.category === 'praise') {
      Object.assign(result, { category: 'complaint', tone: -0.6 * hit.tone, weight: BASE_WEIGHT.complaint(hit.tone) });
      notes.push(`"${negator}" flips it`);
    } else if (hit.category === 'complaint' || hit.category === 'bug') {
      Object.assign(result, { category: 'praise', tone: 0.6, weight: 0.5, severity: undefined });
      notes.push(`"${negator}" flips it`);
    } else if (hit.category === 'spam') {
      Object.assign(result, { category: null, weight: 0 });
      notes.push(`"${negator}" cancels it`);
    } else if (hit.category === null) {
      result.tone = -0.5 * hit.tone;
      notes.push(`"${negator}" flips it`);
    }
  }

  const tail = lastWords.slice(-2).join(' ');
  const intensifier = WORDS.intensifiers.find((word) => tail === word || tail.endsWith(` ${word}`) || lastWords.at(-2) === word);
  if (intensifier && !negator) {
    result.tone *= 1.5;
    result.weight *= 1.2;
    notes.push(`"${intensifier}" makes it stronger`);
  }

  if (result.category === 'praise' && !negator && WORDS.hypothetical.some((re) => re.test(before))) {
    Object.assign(result, { category: 'suggestion', tone: 0.3, weight: 1 });
    notes.push('a wish, not praise');
  }

  if (result.category === 'praise' && WORDS.concession.some((re) => re.test(before))) {
    result.tone *= 0.5;
    result.weight *= 0.5;
    notes.push('a concession: weighs less');
  }

  if (result.category === 'bug' && WORDS.mitigators.some((re) => re.test(whole))) {
    // "A few minor bugs" is filler; "the bird sometimes clips through the dock" is still a report to act on.
    result.tone *= 0.6;
    if (GENERIC_BUG_WORDS.has(hit.label)) result.weight *= 0.7;
    if (result.severity === 'high') result.severity = 'medium';
    notes.push('mitigated: minor or rare');
  }

  if (clause.afterContrast) {
    result.tone *= 1.4;
    result.weight *= 1.4;
    notes.push('after "but": weighs more');
  } else if (clause.beforeContrast) {
    result.tone *= 0.6;
    result.weight *= 0.6;
    notes.push('before "but": weighs less');
  }

  if (result.severity === 'high' && result.category !== hit.category) delete result.severity;
  if (notes.length) result.note = notes.join('; ');
  return result;
}

/** Question marks and question words at the start of a clause count towards `question`. */
function addQuestionMarks(
  folded: string,
  clauses: Clause[],
  hits: Hit[],
  add: (category: Category, weight: number) => void,
): number {
  let marks = 0;
  for (const clause of clauses) {
    if (!clause.isQuestion) continue;
    // "Why would you remove that?" or "What more can I say?" is an opinion, not a question.
    const rhetorical = hits.some(
      (hit) =>
        hit.start >= clause.start &&
        hit.start < clause.end &&
        (hit.category === 'praise' || hit.category === 'complaint' || hit.category === 'toxic'),
    );
    if (rhetorical) continue;
    const words = tokens(folded.slice(clause.start, clause.end)).map((t) => t.word);
    const opener = words.slice(0, 2).join(' ');
    const starts = WORDS.questionStarters.some((s) => words[0] === s || opener === s);
    marks += 1 + (starts ? 0.5 : 0);
  }
  if (marks > 0) add('question', Math.min(marks, 2));
  return marks;
}

const BOX = /[☐☑☒✅✔]/u;

/**
 * Steam "template" reviews list every option and tick a few (☑ Good ☐ Bad).
 * Only the ticked ones are the player's opinion: section headers and unticked
 * options are blanked out with spaces, so offsets still match the original.
 */
export function maskTemplate(text: string): string {
  if (!BOX.test(text)) return text;
  const blank = (s: string) => ' '.repeat(s.length);
  return text
    .replace(/-{2,}\s*\{[^}\n]*\}\s*-{2,}|^\s*-{2,}.*?-{2,}\s*$/gmu, (m) => `\n${blank(m.slice(1))}`)
    .replace(/☐[^☐☑☒✅✔\n]*/gu, blank)
    .replace(/[☑☒✅✔]/gu, '\n');
}
