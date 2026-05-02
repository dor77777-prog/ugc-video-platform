// Quick LLM suggestions for the Step-1 wizard.
//
// Runs ONCE per scrape, alongside the structured-data extraction. A
// single gpt-5.4-mini call returns the wizard's two best
// auto-fill defaults: (1) a one-sentence Hebrew "target audience"
// describing the persona, and (2) a discrete category id from our
// catalog so the UI's category select lands on the right value.
//
// Cost: ~$0.001 per scrape. Cheap enough that we always do it when
// we have a real description; we skip it when the description is
// missing/garbage so we don't burn tokens on a junk input.
//
// Failures are silent — the wizard just doesn't auto-fill those
// fields and the user types them in by hand.

import OpenAI from 'openai';
import type { ProductCategoryId } from '@/lib/categories';

export interface QuickSuggestionsInput {
  productName: string;
  description: string;
  brand?: string | null;
  features?: string[];
}

export interface QuickSuggestions {
  /** Short Hebrew sentence describing the primary audience. Empty
   *  string when the LLM had nothing useful to say. */
  targetAudience: string;
  /** One of our category IDs. Falls back to 'other'. */
  categoryId: ProductCategoryId;
  /** One short Hebrew note explaining the choice (admin debug only). */
  reason: string;
}

const SYSTEM = `You are an Israeli market researcher. Given a product page (title + description + bullet features), output two compact suggestions for the wizard's Step 1 form:

1. targetAudience — ONE Hebrew sentence describing the primary audience persona. Concrete people in Israel ("גברים בני 35-50 עם שיער מידלדל", "אמהות צעירות עם תינוק בן פחות משנה"). Never abstract ("anyone who likes good products").
2. categoryId — pick EXACTLY one of: skincare, haircare, beauty, fitness, food_snack, kitchen_tool, fashion, tech_gadget, wellness_sleep, baby_kids, pets, home_cleaning, jewelry_accessory, supplement, other. If genuinely unclear, use 'other'.

Output strict JSON. Be confident — better to commit to a specific persona than to be vague.`;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['targetAudience', 'categoryId', 'reason'],
  properties: {
    targetAudience: { type: 'string' },
    categoryId: {
      type: 'string',
      enum: [
        'skincare',
        'haircare',
        'beauty',
        'fitness',
        'food_snack',
        'kitchen_tool',
        'fashion',
        'tech_gadget',
        'wellness_sleep',
        'baby_kids',
        'pets',
        'home_cleaning',
        'jewelry_accessory',
        'supplement',
        'other',
      ],
    },
    reason: { type: 'string' },
  },
} as const;

const REQUEST_TIMEOUT_MS = 25_000;

export async function generateQuickSuggestions(
  input: QuickSuggestionsInput,
): Promise<QuickSuggestions | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  // Skip when we have nothing usable to feed the model — a one-word
  // product name + empty description guarantees a generic guess that
  // the heuristic guessCategory does just as well for free.
  const desc = (input.description ?? '').trim();
  const name = (input.productName ?? '').trim();
  if (name.length < 2 || (desc.length < 30 && (input.features?.length ?? 0) < 2)) {
    return null;
  }

  const client = new OpenAI({ apiKey });
  const model = process.env.OPENAI_QUICK_SUGGEST_MODEL ?? process.env.OPENAI_SCRIPT_MODEL ?? 'gpt-5.4-mini';

  const userText = [
    `Product name: ${name}`,
    input.brand ? `Brand: ${input.brand}` : '',
    `Description (cleaned, may be Hebrew): """${desc.slice(0, 3500)}"""`,
    input.features && input.features.length > 0
      ? `Bullet features:\n${input.features.slice(0, 20).map((f) => `  - ${f}`).join('\n')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n');

  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), REQUEST_TIMEOUT_MS);
  try {
    const resp = await client.chat.completions.create(
      {
        model,
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: userText },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'wizard_quick_suggestions', strict: true, schema: SCHEMA },
        },
      },
      { signal: ac.signal },
    );
    const raw = resp.choices?.[0]?.message?.content ?? '';
    const parsed = JSON.parse(raw) as QuickSuggestions;
    return parsed;
  } catch (err) {
    console.warn('[scraper] quick-suggest failed (non-fatal):', (err as Error).message);
    return null;
  } finally {
    clearTimeout(t);
  }
}
