// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SourceViewer } from './SourceViewer';

describe('SourceViewer', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it('aborts its source request when unmounted', async () => {
    let signal: AbortSignal | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) => {
        signal = init?.signal as AbortSignal;
        return new Promise<Response>(() => undefined);
      }),
    );
    await act(async () =>
      root.render(<SourceViewer exampleNum={2} exampleName="Research" onClose={vi.fn()} />),
    );
    await act(async () => root.unmount());
    expect(signal?.aborted).toBe(true);
  });

  it('shows clipboard failures to the user', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ source: 'const value = 1;', filename: 'example.ts' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error('Clipboard blocked')) },
    });

    await act(async () => {
      root.render(<SourceViewer exampleNum={2} exampleName="Research" onClose={vi.fn()} />);
      await Promise.resolve();
      await Promise.resolve();
    });
    const copy = container.querySelector<HTMLButtonElement>('[aria-label="Copy source code"]')!;
    await act(async () => copy.click());
    expect(container.textContent).toContain('Clipboard blocked');
  });

  it('shows a useful message when the source endpoint returns non-JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('Internal Server Error', {
          status: 500,
          headers: { 'Content-Type': 'text/plain' },
        }),
      ),
    );

    await act(async () => {
      root.render(<SourceViewer exampleNum={2} exampleName="Research" onClose={vi.fn()} />);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain('Failed to load source (500)');
  });
});
