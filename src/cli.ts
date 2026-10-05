/**
 *   npm run classify -- <reviews.json | reviews.txt> [options]
 *
 *   --explain            show the evidence and the reasons behind each decision
 *   --ai                 let Claude refine what the rules are unsure about
 *   --all                with --ai, send every comment instead of only the unsure ones
 *   --threshold <n>      confidence below which a comment goes to Claude (default 0.6)
 *   --budget <tokens>    stop calling Claude after this many tokens
 *   --corrections <file> human corrections (JSON); they always win
 *   --json               print JSON instead of a table
 */
import { readFileSync } from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { DEFAULT_MODEL, claudeModel, estimateCost, refineWithClaude } from './llm/refine';
import { type Correction, applyCorrections } from './merge';
import { REFINE_THRESHOLD, classifyWithRules } from './rules';
import { CATEGORIES, type Category, type Classification, type Evidence, PRIORITIES, type Review, SENTIMENTS } from './types';

const reviewSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String).optional(),
  text: z.string(),
  source: z.string().optional(),
  recommended: z.boolean().nullable().optional(),
  helpfulVotes: z.number().int().nonnegative().optional(),
});
const correctionSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  sentiment: z.enum(SENTIMENTS).optional(),
  category: z.enum(CATEGORIES).optional(),
  priority: z.enum(PRIORITIES).optional(),
});

const HELP = readFileSync(new URL(import.meta.url), 'utf8').match(/\/\*\*([\s\S]*?)\*\//)![1]!.replace(/^ \* ?/gm, '');

function parseArgs(argv: string[]) {
  const options = {
    file: undefined as string | undefined,
    explain: false,
    ai: false,
    all: false,
    json: false,
    threshold: REFINE_THRESHOLD,
    budget: undefined as number | undefined,
    corrections: undefined as string | undefined,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    const value = () => {
      const next = argv[++i];
      if (next === undefined) fail(`${arg} needs a value`);
      return next;
    };
    if (arg === '--help' || arg === '-h') {
      console.log(HELP);
      process.exit(0);
    } else if (arg === '--explain') options.explain = true;
    else if (arg === '--ai') options.ai = true;
    else if (arg === '--all') options.all = true;
    else if (arg === '--json') options.json = true;
    else if (arg === '--threshold') options.threshold = Number(value());
    else if (arg === '--budget') options.budget = Number(value());
    else if (arg === '--corrections') options.corrections = value();
    else if (arg.startsWith('--')) fail(`unknown option ${arg}`);
    else options.file = arg;
  }
  if (!options.file) fail('which file? Try: npm run classify -- examples/reviews.json');
  if (!(options.threshold >= 0 && options.threshold <= 1)) fail('--threshold must be between 0 and 1');
  if (options.budget !== undefined && !(options.budget > 0)) fail('--budget must be a positive number of tokens');
  return options;
}

function fail(message: string): never {
  console.error(`classify: ${message}`);
  process.exit(1);
}

function readFile(file: string): string {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    fail(`cannot read ${file}`);
  }
}

function readReviews(file: string): Review[] {
  const raw = readFile(file);
  if (!file.endsWith('.json')) {
    // Plain text: one comment per line.
    return raw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((text, i) => ({ id: `r${i + 1}`, text }));
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    fail(`${file} is not valid JSON`);
  }
  const parsed = z.array(reviewSchema).safeParse(json);
  if (!parsed.success) fail(`${file}: expected an array of { text, id?, source?, recommended?, helpfulVotes? }`);
  return parsed.data.map((review, i) => {
    const { id, source, recommended, helpfulVotes, text } = review;
    return {
      id: id ?? `r${i + 1}`,
      text,
      ...(source !== undefined ? { source } : {}),
      ...(recommended !== undefined ? { recommended } : {}),
      ...(helpfulVotes !== undefined ? { helpfulVotes } : {}),
    };
  });
}

// ---------- Output

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code: string) => (text: string) => (useColor ? `\x1b[${code}m${text}\x1b[0m` : text);
const dim = paint('2');
const bold = paint('1');
const COLORS: Record<Category | 'positive' | 'negative', (text: string) => string> = {
  bug: paint('31'),
  question: paint('36'),
  praise: paint('32'),
  suggestion: paint('34'),
  complaint: paint('33'),
  spam: paint('90'),
  toxic: paint('35'),
  other: dim,
  positive: paint('32'),
  negative: paint('31'),
};

/** The comment with its evidence underlined and colored by what it points to. */
function highlight(text: string, evidence: readonly Evidence[]): string {
  const spans = [...evidence].sort((a, b) => a.start - b.start);
  let out = '';
  let cursor = 0;
  for (const span of spans) {
    if (span.start < cursor) continue;
    out += text.slice(cursor, span.start);
    const piece = text.slice(span.start, span.end);
    out += useColor ? `\x1b[4m${COLORS[span.signal](piece)}` : `[${piece}]`;
    cursor = span.end;
  }
  return out + text.slice(cursor);
}

const oneLine = (text: string, max: number) => {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};

function printTable(reviews: Review[], results: Classification[], explain: boolean, threshold: number) {
  const width = Math.max(40, (process.stdout.columns ?? 120) - 52);
  console.log(dim(`${'ID'.padEnd(6)}${'CATEGORY'.padEnd(12)}${'SENTIMENT'.padEnd(10)}${'PRIORITY'.padEnd(9)}${'CONF'.padEnd(6)}${'BY'.padEnd(7)}COMMENT`));
  results.forEach((result, i) => {
    const review = reviews[i]!;
    const unsure = result.confidence < threshold && result.classifiedBy === 'rules';
    const conf = result.confidence.toFixed(2).padEnd(6);
    console.log(
      result.id.slice(0, 5).padEnd(6) +
        COLORS[result.category](result.category.padEnd(12)) +
        result.sentiment.padEnd(10) +
        (result.priority === 'high' ? bold(result.priority.padEnd(9)) : result.priority.padEnd(9)) +
        (unsure ? paint('33')(conf) : conf) +
        result.classifiedBy.padEnd(7) +
        (explain ? '' : oneLine(review.text, width)),
    );
    if (explain) {
      console.log(`      ${highlight(review.text.replace(/\s+/g, ' '), result.evidence)}`);
      for (const reason of result.reasons) console.log(dim(`        · ${reason}`));
      console.log();
    }
  });
}

// ---------- Main

const options = parseArgs(process.argv.slice(2));
const reviews = readReviews(options.file!);
const corrections: Correction[] = options.corrections
  ? readCorrections(options.corrections).map((c) => ({
      id: c.id,
      ...(c.sentiment ? { sentiment: c.sentiment } : {}),
      ...(c.category ? { category: c.category } : {}),
      ...(c.priority ? { priority: c.priority } : {}),
    }))
  : [];

let results = applyCorrections(reviews.map(classifyWithRules), corrections);
const unsure = results.filter((r) => r.classifiedBy === 'rules' && r.confidence < options.threshold).length;
let aiSummary = '';
let aiError: unknown;
let aiRequests = 0;

if (options.ai) {
  const model = process.env.CLAUDE_MODEL || DEFAULT_MODEL;
  let client: Anthropic;
  try {
    client = new Anthropic();
  } catch {
    fail('--ai needs credentials: set ANTHROPIC_API_KEY (see .env.example) or run `ant auth login`');
  }
  const report = await refineWithClaude(reviews, results, {
    callModel: claudeModel({ client, model }),
    scope: options.all ? 'all' : 'low',
    threshold: options.threshold,
    ...(options.budget !== undefined ? { tokenBudget: options.budget } : {}),
  });
  results = report.results;
  aiError = report.error;
  aiRequests = report.usage.requests;
  const cost = estimateCost(model, report.usage);
  aiSummary =
    `Claude (${model}) refined ${report.refined} of ${report.sent} sent · ${report.usage.requests} requests · ` +
    `${report.usage.inputTokens.toLocaleString()} in / ${report.usage.outputTokens.toLocaleString()} out tokens` +
    (cost !== null ? ` · about $${cost.toFixed(3)}` : '') +
    (report.failed.length ? ` · ${report.failed.length} failed` : '') +
    (report.skippedByBudget ? ` · ${report.skippedByBudget} skipped by the token budget` : '');
}

if (options.json) {
  console.log(JSON.stringify(results, null, 2));
} else {
  printTable(reviews, results, options.explain, options.threshold);
  const counts = Object.entries(
    results.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.category]: (acc[r.category] ?? 0) + 1 }), {}),
  )
    .sort((a, b) => b[1] - a[1])
    .map(([category, n]) => `${COLORS[category as Category](category)} ${n}`);
  const high = results.filter((r) => r.priority === 'high').length;
  console.log(`\n${results.length} comments · ${counts.join(' · ')} · ${bold(`${high} high priority`)}`);
  if (aiSummary) console.log(aiSummary);
  if (aiError) {
    console.error(`classify: Claude stopped early: ${describeError(aiError)}`);
    // The SDK throws a plain Error, before sending anything, when it finds no credentials.
    const neverSent = aiRequests === 0 && !(aiError instanceof Anthropic.APIError);
    console.error(
      neverSent
        ? 'classify: set ANTHROPIC_API_KEY (see .env.example) or run `ant auth login`. Showing the rules\' answers.'
        : 'classify: the comments that were not refined keep the rules\' answer.',
    );
  }
  if (!aiSummary && unsure) console.log(dim(`${unsure} below confidence ${options.threshold}: add --ai to let Claude take a look at those.`));
}

function readCorrections(file: string) {
  const parsed = z.array(correctionSchema).safeParse(JSON.parse(readFile(file)));
  if (!parsed.success) fail(`${file}: expected an array of { id, sentiment?, category?, priority? }`);
  return parsed.data;
}

function describeError(error: unknown): string {
  if (error instanceof Anthropic.AuthenticationError) return 'invalid credentials (check ANTHROPIC_API_KEY)';
  if (error instanceof Anthropic.PermissionDeniedError) return 'this key cannot use that model';
  if (error instanceof Anthropic.NotFoundError) return 'model not found (check CLAUDE_MODEL)';
  if (error instanceof Anthropic.RateLimitError) return 'rate limited, even after retries';
  if (error instanceof Anthropic.APIConnectionError) return 'could not reach the API';
  if (error instanceof Anthropic.APIError) return `API error ${error.status}: ${error.message}`;
  return error instanceof Error ? error.message : String(error);
}
