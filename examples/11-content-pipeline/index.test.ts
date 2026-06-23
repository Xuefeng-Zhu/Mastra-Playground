import { describe, expect, it } from 'vitest';
import { EditSchema } from './index';

describe('content-pipeline edit validation', () => {
  it('requires a suggestion when the editor rejects a draft', () => {
    expect(
      EditSchema.safeParse({ edited: 'draft', score: 5, suggestions: [], approved: false }).success,
    ).toBe(false);
  });

  it('accepts approved drafts without suggestions', () => {
    expect(EditSchema.safeParse({ edited: 'draft', score: 8, suggestions: [], approved: true }).success).toBe(
      true,
    );
  });
});
