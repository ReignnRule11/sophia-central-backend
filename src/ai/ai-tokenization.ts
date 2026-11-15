import { BadRequestException } from '@nestjs/common';
import type { AiConversationTurn } from './groq.service';

export interface PreparedAiPrompt {
  context: string;
  history: AiConversationTurn[];
  estimatedInputTokens: number;
  maxInputTokens: number;
  droppedHistoryTurns: number;
  contextTruncated: boolean;
}

/**
 * Conservative preflight estimate only. Provider-reported usage is the source
 * of truth because each model family can use a different tokenizer/chat format.
 */
export function estimatePromptTokens(text: string): number {
  if (!text) return 0;
  const codePoints = Array.from(text);
  const utf8Bytes = Buffer.byteLength(text, 'utf8');
  const nonAsciiCodePoints = codePoints.filter((character) => character.codePointAt(0)! > 0x7f).length;
  const lexicalPieces = text.match(/[\p{L}\p{N}]+|[^\s\p{L}\p{N}]/gu) || [];

  return Math.ceil(
    Math.max(
      utf8Bytes / 3.5,
      lexicalPieces.length * 1.2,
      nonAsciiCodePoints * 0.9,
    ),
  );
}

function getInputBudget(): number {
  const configured = Number.parseInt(process.env.SOPHIS_AI_MAX_INPUT_TOKENS || '', 10);
  if (!Number.isFinite(configured)) return 12_000;
  return Math.min(64_000, Math.max(1_024, configured));
}

export function prepareAiPrompt(input: {
  systemInstruction: string;
  context?: string;
  history?: AiConversationTurn[];
  prompt: string;
}): PreparedAiPrompt {
  const maxInputTokens = getInputBudget();
  const requiredTokens = estimatePromptTokens(`${input.systemInstruction}\n${input.prompt}`) + 8;
  if (requiredTokens > maxInputTokens) {
    throw new BadRequestException(
      'This question is too long for the current AI input budget. Please shorten the question and try again.',
    );
  }

  const history = [...(input.history || []).slice(-12)];
  let context = (input.context || '').trim();
  const originalContextLength = context.length;

  const count = () =>
    estimatePromptTokens([
      input.systemInstruction,
      context,
      ...history.map((turn) => turn.content),
      input.prompt,
    ].join('\n')) + history.length * 4 + 8;

  // Keep the system instruction and latest student request intact. Remove the
  // oldest context turns first, then shorten optional resource metadata.
  while (history.length > 0 && count() > maxInputTokens) history.shift();

  if (count() > maxInputTokens && context) {
    const characters = Array.from(context);
    let low = 0;
    let high = characters.length;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      context = characters.slice(0, middle).join('');
      if (count() <= maxInputTokens) low = middle;
      else high = middle - 1;
    }
    context = characters.slice(0, low).join('');
  }

  return {
    context,
    history,
    estimatedInputTokens: count(),
    maxInputTokens,
    droppedHistoryTurns: (input.history || []).slice(-12).length - history.length,
    contextTruncated: context.length < originalContextLength,
  };
}
