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
  it('invokes the demo with a silent Tracer without forcing process exit', async () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    const demo = vi.fn().mockResolvedValue(undefined);
    await runCliExample(demo);
    expect(demo).toHaveBeenCalledTimes(1);
    const arg = demo.mock.calls[0][0];
    expect(arg.constructor.name).toBe('Tracer');
    expect(exit).not.toHaveBeenCalled();
    exit.mockRestore();
  });

  it('calls process.exit(1) when the demo throws', async () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    const demo = vi.fn().mockRejectedValue(new Error('boom'));
    const result = runCliExample(demo);
    // The promise resolves because process.exit is mocked
    await result;
    expect(exit).toHaveBeenCalledWith(1);
    exit.mockRestore();
  });
});
