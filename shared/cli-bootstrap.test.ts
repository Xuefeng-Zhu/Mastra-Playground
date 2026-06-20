import { describe, it, expect, vi } from 'vitest';
import { isMain, runCliExample } from './cli-bootstrap.js';

describe('isMain', () => {
  it('matches when metaUrl equals file:// + argv1', () => {
    expect(isMain('file:///foo/index.ts', '/foo/index.ts')).toBe(true);
  });

  it('does not match when argv1 differs', () => {
    expect(isMain('file:///foo/index.ts', '/bar/index.ts')).toBe(false);
  });

  it('handles undefined argv1', () => {
    expect(isMain('file:///foo/index.ts', undefined)).toBe(false);
  });
});

describe('runCliExample', () => {
  it('invokes the demo with a silent Tracer', async () => {
    const demo = vi.fn().mockResolvedValue(undefined);
    await runCliExample('test', demo);
    expect(demo).toHaveBeenCalledTimes(1);
    // The arg is a Tracer; assert by class name
    const arg = demo.mock.calls[0][0];
    expect(arg.constructor.name).toBe('Tracer');
  });
});
