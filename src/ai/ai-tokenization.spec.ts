import { BadRequestException } from '@nestjs/common';
import { prepareAiPrompt, estimatePromptTokens } from './ai-tokenization';

describe('Sophis AI token budgeting', () => {
  const originalBudget = process.env.SOPHIS_AI_MAX_INPUT_TOKENS;

  afterEach(() => {
    if (originalBudget === undefined) delete process.env.SOPHIS_AI_MAX_INPUT_TOKENS;
    else process.env.SOPHIS_AI_MAX_INPUT_TOKENS = originalBudget;
  });

  it('returns zero for an empty prompt and a positive estimate for Unicode text', () => {
    expect(estimatePromptTokens('')).toBe(0);
    expect(estimatePromptTokens('Explain photosynthesis 🌱 in simple terms.')).toBeGreaterThan(0);
  });

  it('drops the oldest history first while preserving the latest request', () => {
    process.env.SOPHIS_AI_MAX_INPUT_TOKENS = '1024';
    const history = Array.from({ length: 12 }, (_, index) => ({
      role: index % 2 === 0 ? 'user' as const : 'assistant' as const,
      content: `Older conversation turn ${index}: ${'background context '.repeat(60)}`,
    }));

    const prepared = prepareAiPrompt({
      systemInstruction: 'You are Sophis. Answer accurately.',
      context: 'Course context',
      history,
      prompt: 'Explain the final concept in one paragraph.',
    });

    expect(prepared.droppedHistoryTurns).toBeGreaterThan(0);
    expect(prepared.history.at(-1)?.content).toContain('background context');
    expect(prepared.estimatedInputTokens).toBeLessThanOrEqual(prepared.maxInputTokens);
  });

  it('truncates optional resource context before sacrificing the latest request', () => {
    process.env.SOPHIS_AI_MAX_INPUT_TOKENS = '1024';
    const longContext = 'Course resource metadata '.repeat(2_000);
    const prepared = prepareAiPrompt({
      systemInstruction: 'You are Sophis. Answer accurately.',
      context: longContext,
      history: [],
      prompt: 'What is the main topic?',
    });

    expect(prepared.contextTruncated).toBe(true);
    expect(prepared.context.length).toBeLessThan(longContext.length);
    expect(prepared.estimatedInputTokens).toBeLessThanOrEqual(prepared.maxInputTokens);
  });

  it('rejects a latest question that cannot fit with the required system instruction', () => {
    process.env.SOPHIS_AI_MAX_INPUT_TOKENS = '1024';
    expect(() => prepareAiPrompt({
      systemInstruction: 'You are Sophis. Answer accurately.',
      prompt: 'Please analyze this: '.repeat(2_000),
    })).toThrow(BadRequestException);
  });

});
