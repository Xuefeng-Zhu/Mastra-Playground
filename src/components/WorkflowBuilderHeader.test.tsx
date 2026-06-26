// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CUSTOM_MODEL_OPTION } from '../hooks/useModelPreferences';
import { WorkflowBuilderHeader, providerDisplayLabel } from './WorkflowBuilderHeader';

describe('WorkflowBuilderHeader', () => {
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

  it('renders workflow status and dispatches provider/model/settings actions', async () => {
    const onProviderChange = vi.fn();
    const onModelChange = vi.fn();
    const onOpenSettings = vi.fn();

    await act(async () =>
      root.render(
        <WorkflowBuilderHeader
          workflowName="Demo Flow"
          isValid={false}
          issueCount={2}
          running={false}
          nodeCount={5}
          maxNodes={12}
          executableNodes={3}
          notice="Needs review"
          provider="google"
          model="gemini-3.1-flash-lite"
          modelOptions={[
            { value: 'gemini-3.1-flash-lite', label: 'Gemini default' },
            { value: CUSTOM_MODEL_OPTION, label: 'Custom model...' },
          ]}
          isCustomProvider={false}
          providerApiKey=""
          customModel=""
          onProviderChange={onProviderChange}
          onModelChange={onModelChange}
          onOpenSettings={onOpenSettings}
        />,
      ),
    );

    expect(container.textContent).toContain('Demo Flow');
    expect(container.textContent).toContain('5/12 nodes');
    expect(container.textContent).toContain('3 editable steps');
    expect(container.textContent).toContain('2 issue(s)');
    expect(container.textContent).toContain('Needs review');

    const [providerSelect, modelSelect] = Array.from(container.querySelectorAll('select'));
    await act(async () => {
      providerSelect.value = 'openrouter';
      providerSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(onProviderChange).toHaveBeenCalledWith('openrouter');

    await act(async () => {
      modelSelect.value = CUSTOM_MODEL_OPTION;
      modelSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(onModelChange).toHaveBeenCalledWith(CUSTOM_MODEL_OPTION);
    expect(onOpenSettings).toHaveBeenCalledTimes(1);

    await act(async () => container.querySelector<HTMLButtonElement>('.custom-configure-btn')?.click());
    expect(onOpenSettings).toHaveBeenCalledTimes(2);
  });

  it('uses concise provider display labels', () => {
    expect(providerDisplayLabel('google')).toBe('Gemini');
    expect(providerDisplayLabel('openrouter')).toBe('OpenRouter');
    expect(providerDisplayLabel('custom')).toBe('Custom endpoint');
  });
});
