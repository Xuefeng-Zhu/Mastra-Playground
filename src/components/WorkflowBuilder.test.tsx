// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkflowBuilder } from './WorkflowBuilder';
import { CUSTOM_WORKFLOW_STORAGE_KEY, SEEDED_CLIENT_CUSTOM_WORKFLOW } from '../registry/custom-workflow';
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

describe('WorkflowBuilder', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
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

    const mockToolButton = Array.from(
      container.querySelectorAll<HTMLButtonElement>('.builder-palette-btn'),
    ).find((button) => button.textContent === 'Mock tool');
    await act(async () => mockToolButton?.click());
    expect(container.querySelector('.builder-node-selected')?.textContent).toContain('Tool step');

    await act(async () => {
      Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
        .find((button) => button.textContent === 'Save Draft')
        ?.click();
    });
    expect(window.localStorage.getItem(CUSTOM_WORKFLOW_STORAGE_KEY)).toContain('tool-1');

    const imported = { ...SEEDED_CLIENT_CUSTOM_WORKFLOW, id: 'imported-flow', name: 'Imported Flow' };
    const importArea = container.querySelector<HTMLTextAreaElement>('.builder-import textarea');
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      setter?.call(importArea, JSON.stringify(imported));
      importArea!.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
        .find((button) => button.textContent === 'Import JSON')
        ?.click();
    });
    expect(container.textContent).toContain('Imported Flow');
    expect(window.localStorage.getItem(CUSTOM_WORKFLOW_STORAGE_KEY)).toContain('Imported Flow');

    await act(async () => {
      Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
        .find((button) => button.textContent?.includes('Run custom workflow'))
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
});
