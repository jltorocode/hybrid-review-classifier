/**
 * Measures the classifier against hand-labeled comments.
 *
 *   npm run eval                  rules only, both sets
 *   npm run eval -- --set b       one set
 *   npm run eval -- --misses      every wrong category, with the text
 *   npm run eval -- --ai          rules + Claude on the low-confidence ones (uses the API)
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_MODEL, claudeModel, estimateCost, refineWithClaude } from '../src/llm/refine';
import { REFINE_THRESHOLD, classifyWithRules } from '../src/rules';
import { CATEGORIES, type Category, type Classification, type Review } from '../src/types';

interface Labeled extends Review {
  expected: { sentiment: string; category: string; priority: string; language: string };
}

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const setArg = args.includes('--set') ? args[args.indexOf('--set') + 1] : undefined;
const sets = (setArg ? [setArg] : ['a', 'b']).map((name) => ({
  name,
  items: JSON.parse(readFileSync(join(here, `set-${name}.json`), 'utf8')) as Labeled[],
}));

const pct = (n: number, total: number) => (total ? `${((100 * n) / total).toFixed(1)}%` : '-');
const FIELDS = ['category', 'sentiment', 'priority', 'language'] as const;

function score(items: Labeled[], results: Classification[]) {
  const row: Record<string, string> = {};
  for (const field of FIELDS) {
    const hits = items.filter((item, i) => results[i]![field] === item.expected[field]).length;
    row[field] = pct(hits, items.length);
  }
  return row;
}

for (const set of sets) {
  const rules = set.items.map((item) => classifyWithRules(item));
  console.log(`\nSet ${set.name.toUpperCase()} · ${set.items.length} comments (English and Spanish)`);
  const table: Record<string, Record<string, string>> = { 'rules only': score(set.items, rules) };

  // Is the confidence worth anything? Compare accuracy above and below the threshold.
  const sure = set.items.filter((_, i) => rules[i]!.confidence >= REFINE_THRESHOLD);
  const sureHits = set.items.filter(
    (item, i) => rules[i]!.confidence >= REFINE_THRESHOLD && rules[i]!.category === item.expected.category,
  ).length;
  const unsureHits = set.items.filter(
    (item, i) => rules[i]!.confidence < REFINE_THRESHOLD && rules[i]!.category === item.expected.category,
  ).length;

  if (flag('ai')) {
    const report = await refineWithClaude(set.items, rules, { callModel: claudeModel() });
    if (report.error) throw report.error;
    table[`rules + Claude (${report.sent} sent)`] = score(set.items, report.results);
    const cost = estimateCost(process.env.CLAUDE_MODEL ?? DEFAULT_MODEL, report.usage);
    console.log(
      `Claude: ${report.usage.requests} requests, ${report.usage.inputTokens} in / ${report.usage.outputTokens} out tokens` +
        (cost !== null ? `, about $${cost.toFixed(3)}` : '') +
        (report.failed.length ? `, ${report.failed.length} failed` : ''),
    );
  }
  console.table(table);
  console.log(
    `Category accuracy when the rules are confident (>= ${REFINE_THRESHOLD}): ${pct(sureHits, sure.length)} of ${sure.length}` +
      ` · when they are not: ${pct(unsureHits, set.items.length - sure.length)} of ${set.items.length - sure.length}`,
  );

  // Confusion matrix: rows are the expected category, columns what the rules said.
  const matrix: Record<string, Record<string, number | string>> = {};
  for (const expected of CATEGORIES) {
    matrix[expected] = Object.fromEntries(CATEGORIES.map((got) => [got, '']));
  }
  set.items.forEach((item, i) => {
    const row = matrix[item.expected.category as Category]!;
    const got = rules[i]!.category;
    row[got] = Number(row[got] || 0) + 1;
  });
  console.log('Category confusion (rows: expected, columns: rules)');
  console.table(matrix);

  if (flag('misses')) {
    set.items.forEach((item, i) => {
      const got = rules[i]!;
      if (got.category === item.expected.category) return;
      console.log(`\n${item.id}  expected ${item.expected.category}, got ${got.category} (${got.confidence})`);
      console.log(`  ${item.text.replace(/\s+/g, ' ').slice(0, 300)}`);
      console.log(`  ${got.reasons.join(' | ')}`);
    });
  }
}
