import type { Category } from './types';

/** A signal found by shape instead of by vocabulary. Same fields as a term match. */
export interface PatternHit {
  start: number;
  end: number;
  category: Category | null;
  tone: number;
  severity?: 'high' | 'medium';
  /** Overrides the default category weight. */
  weight?: number;
  label: string;
}

const URL = /\b(?:https?:\/\/|www\.)\S+|\b[\w-]+\.(?:com|net|org|gg|ly|io|xyz|ru|shop|store|link|me)(?:\/\S*)?/giu;
/** Links written to dodge filters: "keys dot shop", "site .com", "site(dot)com". */
const HIDDEN_URL = /\b[\w-]{3,}\s*(?:\s\.|\(dot\)|\[dot\]|\sdot\s|\spunto\s)\s*(?:com|net|org|gg|io|xyz|ru|shop|store|link|cl|es)\b/giu;
const SCORE = /(?<![\d/])(\d{1,3}(?:[.,]\d)?)\s*\/\s*(10|5|100)(?![\d/])/gu;
const STARS = /([★⭐]{1,5})(☆{0,5})/gu;
const TEXT_KEY = /\b[A-Z][A-Z0-9]*_[A-Z0-9_]{2,}\b/gu;
const PRICE = /(?:[$€£]\s?(\d+(?:[.,]\d+)?))|(?:(\d+(?:[.,]\d+)?)\s?(?:usd|dollars?|bucks|euros?|dolares)\b)/giu;
const HOURS = /(\d+(?:[.,]\d+)?)\s?(?:h|hrs?|hours?|horas?)\b/giu;
const POSITIVE_EMOJI = /[😍🥰❤💖💕💗🔥👍💯🤩😁😄😊🙌👏🏆✨🥳😎]/gu;
const NEGATIVE_EMOJI = /[😡🤬🤮💩👎😴😤😒🙄😞😠🤢]/gu;

const number = (raw: string) => Number(raw.replace(',', '.'));

/** Signals in the original text: links, review scores, stars, price per hour, leaked text keys, emoji. */
export function findPatterns(text: string): PatternHit[] {
  const hits: PatternHit[] = [];

  for (const m of text.matchAll(URL)) {
    hits.push({ start: m.index, end: m.index + m[0].length, category: 'spam', tone: 0, weight: 1.5, label: 'link' });
  }

  for (const m of text.matchAll(HIDDEN_URL)) {
    hits.push({ start: m.index, end: m.index + m[0].length, category: 'spam', tone: 0, weight: 2, label: 'disguised link' });
  }

  for (const m of text.matchAll(SCORE)) {
    const ratio = number(m[1]!) / number(m[2]!);
    if (ratio > 1) continue;
    hits.push(scoreHit(m.index, m.index + m[0].length, ratio, `score ${m[0].replace(/\s/g, '')}`));
  }

  for (const m of text.matchAll(STARS)) {
    const filled = [...m[1]!].length;
    const total = m[2] ? filled + [...m[2]].length : 5;
    hits.push(scoreHit(m.index, m.index + m[0].length, filled / total, `${filled}/${total} stars`));
  }

  for (const m of text.matchAll(TEXT_KEY)) {
    hits.push({ start: m.index, end: m.index + m[0].length, category: 'bug', tone: -1, label: 'untranslated text key' });
  }

  const price = [...text.matchAll(PRICE)][0];
  const hours = [...text.matchAll(HOURS)][0];
  if (hours && !price && number(hours[1]!) >= 50) {
    // "200 hours in": people rarely sink that much time into a game they dislike.
    hits.push({ start: hours.index, end: hours.index + hours[0].length, category: 'praise', tone: 1, weight: 0.8, label: 'hours played' });
  }
  if (price && hours) {
    const perHour = number(price[1] ?? price[2]!) / Math.max(number(hours[1]!), 0.1);
    const start = Math.min(price.index, hours.index);
    const end = Math.max(price.index + price[0].length, hours.index + hours[0].length);
    if (perHour >= 3) {
      hits.push({ start, end, category: 'complaint', tone: -1.5, label: `${perHour.toFixed(1)} per hour of play` });
    } else if (perHour <= 0.5) {
      hits.push({ start, end, category: 'praise', tone: 1.5, label: `${perHour.toFixed(2)} per hour of play` });
    }
  }

  for (const m of text.matchAll(POSITIVE_EMOJI)) {
    hits.push({ start: m.index, end: m.index + m[0].length, category: 'praise', tone: 0.7, weight: 0.4, label: 'emoji' });
  }
  for (const m of text.matchAll(NEGATIVE_EMOJI)) {
    hits.push({ start: m.index, end: m.index + m[0].length, category: 'complaint', tone: -0.7, weight: 0.4, label: 'emoji' });
  }

  return hits;
}

function scoreHit(start: number, end: number, ratio: number, label: string): PatternHit {
  if (ratio >= 0.8) return { start, end, category: 'praise', tone: 2.5, weight: 1.2, label };
  if (ratio >= 0.6) return { start, end, category: 'praise', tone: 1, label };
  if (ratio > 0.4) return { start, end, category: 'complaint', tone: -0.5, weight: 0.6, label };
  return { start, end, category: 'complaint', tone: -2.5, weight: 1.2, label };
}
