// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkflowBuilder } from './WorkflowBuilder';
import { CUSTOM_WORKFLOW_STORAGE_KEY, SEEDED_CLIENT_CUSTOM_WORKFLOW } from '../registry/custom-workflow';
import { CUSTOM_WORKFLOW_LAYOUT_STORAGE_KEY } from '../registry/custom-workflow-flow';
import { streamCustomWorkflow } from '../hooks/workflow-stream';

vi.mock('../hooks/workflow-stream', () => ({
  streamCustomWorkflow: vi.fn(async ({ onEvent }) => {
    onEvent({ type: 'start', workflow: 'Starter Workflow', input: {}, steps: [] });
    onEvent({ type: 'step:start', stepId: 'input' });
    onEvent({ type: 'step:end', stepId: 'input' });
    onEvent({ type: 'tool:call', stepId: 'tool-1', tool: 'echo', input: 'hello', output: { text: 'hello' } });
    onEvent({ type: 'done', status: 'success', output: { answer: 'done' }, totalMs: 10 });
  }),
}));

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function buttonWithText(container: HTMLElement, text: string) {
  return Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find((button) =>
    button.textContent?.includes(text),
  );
}

function consoleTab(container: HTMLElement, text: string) {
  return Array.from(container.querySelectorAll<HTMLButtonElement>('.builder-console-tabs button')).find(
    (button) => button.textContent === text,
  );
}

describe('WorkflowBuilder', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    class ResizeObserverStub {
      observe() {}
      unobserve() {}
      disconnect() {}
    }

    vi.stubGlobal('ResizeObserver', ResizeObserverStub);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    window.localStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('adds/selects nodes, saves/imports JSON, and streams a run', async () => {
    await act(async () => root.render(<WorkflowBuilder />));

    await act(async () => buttonWithText(container, 'Classifier')?.click());
    expect(container.querySelector('.builder-flow-node-selected')?.textContent).toContain('Classifier');
    expect(container.querySelector('.builder-flow-node-selected')?.textContent).toContain('classification');

    await act(async () => buttonWithText(container, 'Summarize')?.click());
    expect(container.querySelector('.builder-flow-node-selected')?.textContent).toContain('Summarize');
    expect(container.querySelector<HTMLSelectElement>('.builder-inspector select')?.value).toBe('summarize');
    expect(container.textContent).toContain('Summarize added before Output');

    await act(async () => buttonWithText(container, 'Contains Text')?.click());
    expect(container.querySelector('.builder-flow-node-selected')?.textContent).toContain('Contains Text');
    expect(container.querySelector<HTMLSelectElement>('.builder-inspector select')?.value).toBe('contains');
    expect(
      Array.from(container.querySelectorAll<HTMLInputElement>('.builder-inspector input')).some(
        (input) => input.value === 'approved',
      ),
    ).toBe(true);
    expect(
      Array.from(container.querySelectorAll<HTMLButtonElement>('.builder-toolbar button')).map((button) =>
        button.textContent?.trim(),
      ),
    ).not.toEqual(expect.arrayContaining(['Save', 'Load', 'Reset']));

    await act(async () => {
      buttonWithText(container, 'Save')?.click();
    });
    expect(window.localStorage.getItem(CUSTOM_WORKFLOW_STORAGE_KEY)).toContain('classification');
    expect(window.localStorage.getItem(CUSTOM_WORKFLOW_STORAGE_KEY)).toContain('summarize');
    expect(window.localStorage.getItem(CUSTOM_WORKFLOW_STORAGE_KEY)).toContain('contains');
    expect(window.localStorage.getItem(CUSTOM_WORKFLOW_LAYOUT_STORAGE_KEY)).toContain('branch-2');

    await act(async () => {
      Array.from(container.querySelectorAll<HTMLButtonElement>('.builder-palette-footer button'))
        .find((button) => button.textContent === 'Import JSON')
        ?.click();
    });
    expect(container.querySelector<HTMLTextAreaElement>('.builder-import textarea')).toBeTruthy();

    await act(async () => {
      Array.from(container.querySelectorAll<HTMLButtonElement>('.builder-console-tabs button'))
        .find((button) => button.textContent === 'json')
        ?.click();
    });
    const imported = { ...SEEDED_CLIENT_CUSTOM_WORKFLOW, id: 'imported-flow', name: 'Imported Flow' };
    const importArea = container.querySelector<HTMLTextAreaElement>('.builder-import textarea');
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      setter?.call(importArea, JSON.stringify(imported));
      importArea!.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      Array.from(container.querySelectorAll<HTMLButtonElement>('.builder-import button'))
        .find((button) => button.textContent === 'Import JSON' && !button.disabled)
        ?.click();
    });
    expect(container.textContent).toContain('Imported Flow');
    expect(window.localStorage.getItem(CUSTOM_WORKFLOW_STORAGE_KEY)).toContain('Imported Flow');

    await act(async () => {
      Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
        .find((button) => button.textContent?.includes('Run') && button.classList.contains('builder-run-btn'))
        ?.click();
    });
    await settle();

    expect(streamCustomWorkflow).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(vi.mocked(streamCustomWorkflow).mock.calls[0]?.[0].requestBody)).toContain(
      'Imported Flow',
    );
    expect(container.textContent).toContain('done');
    expect(container.textContent).toContain('Sources (1)');
  });

  it('recovers from corrupt saved workflow JSON when loading explicitly', async () => {
    await act(async () => root.render(<WorkflowBuilder />));
    window.localStorage.setItem(CUSTOM_WORKFLOW_STORAGE_KEY, '{not-json');

    await act(async () => buttonWithText(container, 'Load')?.click());

    expect(container.textContent).toContain('Saved draft was invalid and has been cleared');
    expect(window.localStorage.getItem(CUSTOM_WORKFLOW_STORAGE_KEY)).toBeNull();

    window.localStorage.setItem(
      CUSTOM_WORKFLOW_STORAGE_KEY,
      JSON.stringify({ version: 1, nodes: [], edges: [] }),
    );
    await act(async () => buttonWithText(container, 'Load')?.click());

    expect(container.textContent).toContain('Saved draft was invalid and has been cleared');
    expect(window.localStorage.getItem(CUSTOM_WORKFLOW_STORAGE_KEY)).toBeNull();
  });

  it('keeps working when browser storage is unavailable', async () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage unavailable');
    });
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });
    const removeItem = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('storage unavailable');
    });

    try {
      await act(async () => root.render(<WorkflowBuilder />));
      expect(container.textContent).toContain('Starter Workflow');

      await act(async () => buttonWithText(container, 'Save')?.click());
      expect(container.textContent).toContain('Save failed');

      await act(async () => buttonWithText(container, 'Load')?.click());
      expect(container.textContent).toContain('No saved draft found');
    } finally {
      getItem.mockRestore();
      setItem.mockRestore();
      removeItem.mockRestore();
    }
  });

  it('keeps diagnostic tabs usable after a failed custom workflow run', async () => {
    vi.mocked(streamCustomWorkflow).mockImplementationOnce(async ({ onEvent }) => {
      onEvent({ type: 'start', workflow: 'Starter Workflow', input: {}, steps: [] });
      onEvent({
        type: 'done',
        status: 'failed',
        output: { error: 'Workflow failed', errorId: 'err-123' },
        totalMs: 0,
      });
    });
    await act(async () => root.render(<WorkflowBuilder />));

    await act(async () => buttonWithText(container, 'Run')?.click());
    await settle();

    expect(container.textContent).toContain('Workflow failed (err-123)');

    await act(async () => consoleTab(container, 'json')?.click());
    expect(container.querySelector<HTMLTextAreaElement>('.builder-import textarea')).toBeTruthy();

    await act(async () => consoleTab(container, 'trace')?.click());
    expect(container.textContent).toContain('Events');
  });

  it('renders JSON-like custom workflow answers as structured output', async () => {
    vi.mocked(streamCustomWorkflow).mockImplementationOnce(async ({ onEvent }) => {
      onEvent({ type: 'start', workflow: 'Tool Only', input: {}, steps: [] });
      onEvent({
        type: 'done',
        status: 'success',
        output: { answer: '{"text":"hello","count":1}' },
        totalMs: 1,
      });
    });
    await act(async () => root.render(<WorkflowBuilder />));

    await act(async () => buttonWithText(container, 'Run')?.click());
    await settle();

    expect(container.querySelector('.json-pre')?.textContent).toContain('"text": "hello"');
    expect(container.querySelector('.json-pre')?.textContent).toContain('"count": 1');
  });
});
