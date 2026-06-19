import { describe, it, expect } from 'vitest';
import { sanitizeText, isPlainObject, ValidationError, RateLimitError } from './validation.js';

describe('sanitizeText', () => {
  it('returns empty string for non-strings', () => {
    expect(sanitizeText(undefined)).toBe('');
    expect(sanitizeText(null)).toBe('');
    expect(sanitizeText(42)).toBe('');
    expect(sanitizeText({})).toBe('');
  });

  it('passes through normal strings unchanged', () => {
    expect(sanitizeText('hello world')).toBe('hello world');
    expect(sanitizeText('with\nnewlines\tand\ttabs')).toBe('with\nnewlines\tand\ttabs');
  });

  it('strips control characters except \\n \\r \\t', () => {
    expect(sanitizeText('hello\x00\x01\x02world')).toBe('helloworld');
    expect(sanitizeText('a\x07b\x08c\x0Bd\x1Fe\x7Ff')).toBe('abcdef');
  });

  it('keeps \\n \\r \\t as the allowed whitespace', () => {
    expect(sanitizeText('line1\nline2\rline3\tcol4')).toBe('line1\nline2\rline3\tcol4');
  });

  it('caps at the default 4KB length', () => {
    const long = 'a'.repeat(10000);
    const result = sanitizeText(long);
    expect(result.length).toBe(4096);
  });

  it('honors a custom maxLength', () => {
    expect(sanitizeText('abcdef', 3)).toBe('abc');
  });
});

describe('isPlainObject', () => {
  it('returns true for plain objects', () => {
    expect(isPlainObject({})).toBe(true);
    expect(isPlainObject({ a: 1 })).toBe(true);
  });

  it('returns true for objects with Object.create(Object.prototype)', () => {
    expect(isPlainObject(Object.create(Object.prototype))).toBe(true);
  });

  it('returns false for non-objects', () => {
    expect(isPlainObject(null)).toBe(false);
    expect(isPlainObject(undefined)).toBe(false);
    expect(isPlainObject(42)).toBe(false);
    expect(isPlainObject('string')).toBe(false);
    expect(isPlainObject(true)).toBe(false);
  });

  it('returns false for arrays and built-in objects', () => {
    expect(isPlainObject([])).toBe(false);
    expect(isPlainObject([1, 2])).toBe(false);
    expect(isPlainObject(new Date())).toBe(false);
    expect(isPlainObject(new Map())).toBe(false);
    expect(isPlainObject(/regex/)).toBe(false);
  });
});

describe('ValidationError', () => {
  it('has status 400 and preserves field and detail', () => {
    const err = new ValidationError('bad input', 'message', 'must be a string');
    expect(err.status).toBe(400);
    expect(err.name).toBe('ValidationError');
    expect(err.message).toBe('bad input');
    expect(err.field).toBe('message');
    expect(err.detail).toBe('must be a string');
  });
});

describe('RateLimitError', () => {
  it('has status 429 and a retryAfter value', () => {
    const err = new RateLimitError(42);
    expect(err.status).toBe(429);
    expect(err.retryAfter).toBe(42);
    expect(err.message).toContain('42');
  });
});
