import Anthropic from '@anthropic-ai/sdk';
import { keepManual } from '../merge';
import { fold } from '../normalize';
import { REFINE_THRESHOLD } from '../rules';
import type { Classification, Evidence, Review } from '../types';
import { type PromptComment, SYSTEM_PROMPT, batchPrompt } from './prompt';
import { BATCH_JSON_SCHEMA, type BatchOutput, batchSchema } from './schema';

export const DEFAULT_MODEL = 'claude-opus-5-5';

/** Comments per request. A truncated answer is retried as two smaller batches. */
export const MAX_BATCH = 20;

/** Reference prices in USD per million tokens, only to show an estimate. */
const PRICES: Record<string, { input: number; output: number }> = {
  'claude-opus-5-5': { input: 4, output: 20 },
  'claude-sonnet-5-5': { input: 2, output: 10 },
};

export interface Usage {
  requests: number;
  inputTokens: number;
  outputTokens: number;
}

export type ModelResult =
  | { kind: 'ok'; output: BatchOutput; usage: Usage }
  | { kind: 'max_tokens'; usage: Usage }
  | { kind: 'failed'; usage: Usage; detail: string };

/** One structured-output call. Injected, so tests never hit the API. */
export type ClassifyModel = (system: string, prompt: string) => Promise<ModelResult>;

export interface ClaudeOptions {
  client?: Anthropic;
  model?: string;
}

export function claudeModel({ client = new Anthropic(), model = DEFAULT_MODEL }: ClaudeOptions = {}): ClassifyModel {
  return async (system, prompt) => {
    const response = await client.beta.messages.create({
      model,
      max_tokens: 16000,
      system,
      messages: [{ role: 'user', content: prompt }],
      // Classification does well at low effort, which keeps thinking short and cheap.
      output_config: { effort: 'low', format: { type: 'json_schema', schema: BATCH_JSON_SCHEMA } },
      // If a safety classifier declines a batch, the API retries it on a fallback model in the same call.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });
    const { usage } = response;
    const counted: Usage = {
      requests: 1,
      inputTokens: usage.input_tokens + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0),
      outputTokens: usage.output_tokens,
    };
    if (response.stop_reason === 'max_tokens') return { kind: 'max_tokens', usage: counted };
    if (response.stop_reason === 'refusal') {
      return { kind: 'failed', usage: counted, detail: 'Claude declined to classify this batch.' };
    }
    const text = response.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('');
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return { kind: 'failed', usage: counted, detail: 'The answer was not valid JSON.' };
    }
    const parsed = batchSchema.safeParse(json);
    if (!parsed.success) return { kind: 'failed', usage: counted, detail: 'The answer did not match the schema.' };
    return { kind: 'ok', output: parsed.data, usage: counted };
  };
}

export interface RefineOptions {
  callModel: ClassifyModel;
  /** `low` (default): only what the rules were unsure about. `all`: everything not corrected by a person. */
  scope?: 'low' | 'all';
  threshold?: number;
  /** Stops sending batches once this many tokens (input + output) have been used. */
  tokenBudget?: number;
}

export interface RefineReport {
  results: Classification[];
  /** Comments sent to the model. */
  sent: number;
  refined: number;
  /** Comments left with the rules' answer because the token budget ran out. */
  skippedByBudget: number;
  failed: { id: string; error: string }[];
  usage: Usage;
  /** Set when a request threw (bad credentials, network…). Later batches were not sent. */
  error?: unknown;
}

const ZERO: Usage = { requests: 0, inputTokens: 0, outputTokens: 0 };
const addUsage = (a: Usage, b: Usage): Usage => ({
  requests: a.requests + b.requests,
  inputTokens: a.inputTokens + b.inputTokens,
  outputTokens: a.outputTokens + b.outputTokens,
});

/**
 * Sends the comments the rules were unsure about to Claude, in batches, and
 * merges the answers back. Manual corrections are never sent or overwritten.
 */
export async function refineWithClaude(
  reviews: readonly Review[],
  results: readonly Classification[],
  options: RefineOptions,
): Promise<RefineReport> {
  const threshold = options.threshold ?? REFINE_THRESHOLD;
  const reviewById = new Map(reviews.map((review) => [review.id, review]));
  const current = new Map(results.map((result) => [result.id, result]));
  const candidates = results.filter(
    (result) =>
      result.classifiedBy !== 'manual' &&
      reviewById.has(result.id) &&
      (options.scope === 'all' || result.confidence < threshold),
  );

  const report: RefineReport = { results: [], sent: 0, refined: 0, skippedByBudget: 0, failed: [], usage: ZERO };
  for (let i = 0; i < candidates.length; i += MAX_BATCH) {
    const spent = report.usage.inputTokens + report.usage.outputTokens;
    if (options.tokenBudget !== undefined && spent >= options.tokenBudget) {
      report.skippedByBudget = candidates.length - i;
      break;
    }
    const batch = candidates.slice(i, i + MAX_BATCH).map((result) => reviewById.get(result.id)!);
    report.sent += batch.length;
    let outcome: BatchResult;
    try {
      outcome = await classifyBatch(batch, options.callModel);
    } catch (error) {
      report.error = error;
      report.failed.push(...batch.map((review) => ({ id: review.id, error: 'request failed' })));
      break;
    }
    report.usage = addUsage(report.usage, outcome.usage);
    report.failed.push(...outcome.failed);
    for (const classified of outcome.classified) {
      current.set(classified.id, keepManual(current.get(classified.id), classified));
      report.refined += 1;
    }
  }
  report.results = results.map((result) => current.get(result.id)!);
  return report;
}

interface BatchResult {
  classified: Classification[];
  failed: { id: string; error: string }[];
  usage: Usage;
}

const CONFIDENCE_VALUE = { high: 0.9, medium: 0.75, low: 0.5 } as const;

/**
 * Classifies up to MAX_BATCH comments in one call. Comments go out with short
 * keys (c1, c2…) and are mapped back; anything missing is reported as failed.
 */
async function classifyBatch(reviews: readonly Review[], callModel: ClassifyModel): Promise<BatchResult> {
  const keyed: (PromptComment & { review: Review })[] = reviews.map((review, index) => ({
    key: `c${index + 1}`,
    text: review.text,
    source: review.source,
    recommended: review.recommended,
    review,
  }));
  const result = await callModel(SYSTEM_PROMPT, batchPrompt(keyed));

  if (result.kind === 'max_tokens') {
    if (reviews.length === 1) {
      return { classified: [], failed: [{ id: reviews[0]!.id, error: 'answer hit max_tokens' }], usage: result.usage };
    }
    const half = Math.ceil(reviews.length / 2);
    const first = await classifyBatch(reviews.slice(0, half), callModel);
    const second = await classifyBatch(reviews.slice(half), callModel);
    return {
      classified: [...first.classified, ...second.classified],
      failed: [...first.failed, ...second.failed],
      usage: addUsage(result.usage, addUsage(first.usage, second.usage)),
    };
  }
  if (result.kind === 'failed') {
    return { classified: [], failed: reviews.map((r) => ({ id: r.id, error: result.detail })), usage: result.usage };
  }

  const byKey = new Map(result.output.items.map((item) => [item.id.trim(), item]));
  const classified: Classification[] = [];
  const failed: BatchResult['failed'] = [];
  for (const { key, review } of keyed) {
    const item = byKey.get(key);
    if (!item) {
      failed.push({ id: review.id, error: 'missing from the answer' });
      continue;
    }
    const { evidence, dropped } = locateQuotes(review.text, item.evidence, item.category);
    classified.push({
      id: review.id,
      sentiment: item.sentiment,
      category: item.category,
      priority: item.priority,
      language: item.language.trim().toLowerCase().slice(0, 12) || 'und',
      confidence: CONFIDENCE_VALUE[item.confidence],
      classifiedBy: 'ai',
      reasons: [item.reason.trim(), ...(dropped ? [`${dropped} quote(s) not found in the text were dropped`] : [])],
      evidence,
    });
  }
  return { classified, failed, usage: result.usage };
}

/** Turns the model's quotes into offsets. A quote that is not really in the text is dropped. */
function locateQuotes(text: string, quotes: readonly string[], signal: Evidence['signal']) {
  const folded = fold(text);
  const evidence: Evidence[] = [];
  let dropped = 0;
  for (const quote of quotes.slice(0, 3)) {
    const needle = fold(quote.trim());
    const start = needle ? folded.indexOf(needle) : -1;
    if (start === -1) {
      dropped += 1;
      continue;
    }
    evidence.push({ start, end: start + needle.length, text: text.slice(start, start + needle.length), signal });
  }
  return { evidence, dropped };
}

/** Estimated cost in USD, or `null` for a model without a reference price. */
export function estimateCost(model: string, usage: Usage): number | null {
  const price = PRICES[model];
  if (!price) return null;
  return (usage.inputTokens * price.input + usage.outputTokens * price.output) / 1_000_000;
}
