// Expands a chosen concept card into a full LlmScript via the same
// path expandPickedConceptsAction uses (no DB writes, no credit
// charge). Each expansion is one structured call to the configured
// provider with SINGLE_SCRIPT_JSON_SCHEMA.

import { SINGLE_SCRIPT_JSON_SCHEMA } from '@ugc-video/prompts';
import {
  buildExpansionPromptFragment,
  type ScriptProvider,
  type RawConceptCard,
} from '../../../lib/llm/concept-engine';
import { openaiStructuredCall } from '../../../lib/llm/openai-script-client';
import { anthropicStructuredCall } from '../../../lib/llm/anthropic-script-client';
import { geminiStructuredCall } from '../../../lib/llm/gemini-client';
import type { StoredConcept } from '../../../lib/llm/concept-storage';
import { wrapRawConceptsForStorage } from '../../../lib/llm/concept-storage';

/** Minimal shape we need from the expanded LlmScript for the metrics
 *  in Sub-task 1. We don't run the full toGenerated mapper here —
 *  metrics need framework + scenes[].spoken_text_hebrew + scene_goal
 *  only. Keeping the type narrow avoids dragging the full
 *  GeneratedScript type into the eval surface. */
export interface ExpandedScriptShape {
  framework: string;
  scenes: Array<{
    scene_order: number;
    scene_goal: string;
    spoken_text_hebrew: string;
    on_screen_caption_hebrew?: string;
    visual_prompt_english?: string;
  }>;
}

export interface ExpandRunnerInput {
  /** Raw concept card to expand. The runner wraps it with default
   *  server-managed fields (concept_id, slot_index) before passing to
   *  buildExpansionPromptFragment so we mirror production exactly. */
  rawCard: RawConceptCard;
  /** Slot index to record on the wrapped card (matches slot the card
   *  came back in from generateConceptCards). */
  slotIndex: number;
  /** Shared system instruction (same instance the concept-runner used
   *  — we want to hit the prefix cache across phase 1 + phase 2). */
  systemInstruction: string;
  /** Phase-1 user prompt (re-used as the prefix for the expansion's
   *  user prompt — production does this exact concat). */
  conceptBatchUserPrompt: string;
  provider: ScriptProvider;
  model: string;
}

export interface ExpandRunnerResult {
  script: ExpandedScriptShape;
  storedConcept: StoredConcept;
  usage: { inputTokens: number; outputTokens: number };
  durationMs: number;
}

export async function runExpandConcept(
  input: ExpandRunnerInput,
): Promise<ExpandRunnerResult> {
  // Wrap the raw card with server-managed fields so the expansion
  // prompt fragment renders the SAME way production renders it (with
  // a real concept_id, the chosen slot_index, etc.). The wrapper
  // assigns a fresh UUID; we override slot_index to match the actual
  // batch slot.
  const [wrapped] = wrapRawConceptsForStorage([input.rawCard]);
  if (!wrapped) {
    throw new Error('expand-runner: wrapRawConceptsForStorage returned no card');
  }
  const concept: StoredConcept = { ...wrapped, slot_index: input.slotIndex };

  const userPrompt =
    input.conceptBatchUserPrompt + buildExpansionPromptFragment(concept);

  const start = performance.now();
  let parsed: { script: Record<string, unknown> };
  let usage: { inputTokens: number; outputTokens: number };

  if (input.provider === 'anthropic') {
    const r = await anthropicStructuredCall<{ script: Record<string, unknown> }>({
      systemInstruction: input.systemInstruction,
      userPrompt,
      responseSchema: SINGLE_SCRIPT_JSON_SCHEMA,
      model: input.model,
    });
    parsed = r.parsed;
    usage = { inputTokens: r.usage.inputTokens, outputTokens: r.usage.outputTokens };
  } else if (input.provider === 'gemini') {
    const r = await geminiStructuredCall<{ script: Record<string, unknown> }>({
      systemInstruction: input.systemInstruction,
      userPrompt,
      responseSchema: SINGLE_SCRIPT_JSON_SCHEMA,
      model: input.model,
    });
    parsed = r.parsed;
    usage = { inputTokens: r.usage.inputTokens, outputTokens: r.usage.outputTokens };
  } else {
    const r = await openaiStructuredCall<{ script: Record<string, unknown> }>({
      systemInstruction: input.systemInstruction,
      userPrompt,
      responseSchema: SINGLE_SCRIPT_JSON_SCHEMA,
      model: input.model,
      temperature: 0.7,
    });
    parsed = r.parsed;
    usage = { inputTokens: r.usage.inputTokens, outputTokens: r.usage.outputTokens };
  }

  const durationMs = performance.now() - start;

  return {
    script: parsed.script as unknown as ExpandedScriptShape,
    storedConcept: concept,
    usage,
    durationMs,
  };
}
