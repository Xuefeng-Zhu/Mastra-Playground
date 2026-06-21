import { describe, it, expect } from 'vitest';
import { unwrapWorkflowOutput } from './workflow-helpers';

describe('unwrapWorkflowOutput', () => {
  it('returns the object as-is when it has a known top-level key', () => {
    const wrapped = { classify: { result: 'foo' }, __test: true };
    expect(unwrapWorkflowOutput(wrapped)).toEqual({ classify: { result: 'foo' }, __test: true });
  });

  it('returns null when given null', () => {
    expect(unwrapWorkflowOutput(null)).toBeNull();
  });

  it('returns the object unchanged when it has multiple keys (not a wrapper)', () => {
    const multi = { a: 1, b: 2, c: 3 };
    expect(unwrapWorkflowOutput(multi)).toBe(multi);
  });

  it('returns an empty object unchanged', () => {
    expect(unwrapWorkflowOutput({})).toEqual({});
  });

  it('handles nested objects by unwrapping the single outer key', () => {
    const wrapped = { classify: { result: { deep: { value: 42 } } } };
    expect(unwrapWorkflowOutput(wrapped)).toEqual({ result: { deep: { value: 42 } } });
  });

  it('handles arrays and primitives by passing them through', () => {
    expect(unwrapWorkflowOutput([1, 2, 3])).toEqual([1, 2, 3]);
    expect(unwrapWorkflowOutput('string')).toBe('string');
    expect(unwrapWorkflowOutput(42)).toBe(42);
  });
});
