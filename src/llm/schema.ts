import { z } from 'zod';
import { CATEGORIES, PRIORITIES, SENTIMENTS } from '../types';

export const MODEL_CONFIDENCE = ['high', 'medium', 'low'] as const;

/** One classified comment, exactly as Claude must return it. */
export const itemSchema = z.object({
  id: z.string(),
  sentiment: z.enum(SENTIMENTS),
  category: z.enum(CATEGORIES),
  priority: z.enum(PRIORITIES),
  language: z.string(),
  confidence: z.enum(MODEL_CONFIDENCE),
  reason: z.string(),
  evidence: z.array(z.string()),
});

export const batchSchema = z.object({ items: z.array(itemSchema) });
export type BatchOutput = z.infer<typeof batchSchema>;

/**
 * The JSON Schema sent as `output_config.format`. Written by hand so the enums
 * reach the API and constrain decoding: the model cannot invent a category.
 * The answer is still validated with Zod before it is used.
 */
export const BATCH_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'sentiment', 'category', 'priority', 'language', 'confidence', 'reason', 'evidence'],
        properties: {
          id: { type: 'string' },
          sentiment: { type: 'string', enum: [...SENTIMENTS] },
          category: { type: 'string', enum: [...CATEGORIES] },
          priority: { type: 'string', enum: [...PRIORITIES] },
          language: { type: 'string', description: 'ISO 639-1 code, e.g. en, es, pt' },
          confidence: { type: 'string', enum: [...MODEL_CONFIDENCE] },
          reason: { type: 'string' },
          evidence: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
} as const;
