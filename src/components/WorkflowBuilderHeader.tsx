import { CUSTOM_MODEL_OPTION } from '../hooks/useModelPreferences';
import { PROVIDER_OPTIONS, type ModelProvider } from '../registry/examples';

interface WorkflowBuilderHeaderProps {
  workflowName: string;
  isValid: boolean;
  issueCount: number;
  running: boolean;
  nodeCount: number;
  maxNodes: number;
  executableNodes: number;
  notice: string;
  provider: ModelProvider;
  model: string;
  modelOptions: ReadonlyArray<{ value: string; label: string }>;
  isCustomProvider: boolean;
  providerApiKey: string;
  customModel: string;
  onProviderChange: (provider: ModelProvider) => void;
  onModelChange: (model: string) => void;
  onOpenSettings: () => void;
}

export function providerDisplayLabel(provider: ModelProvider): string {
  return PROVIDER_OPTIONS.find((option) => option.value === provider)?.label.split(' · ')[0] ?? 'Provider';
}

export function WorkflowBuilderHeader({
  workflowName,
  isValid,
  issueCount,
  running,
  nodeCount,
  maxNodes,
  executableNodes,
  notice,
  provider,
  model,
  modelOptions,
  isCustomProvider,
  providerApiKey,
  customModel,
  onProviderChange,
  onModelChange,
  onOpenSettings,
}: WorkflowBuilderHeaderProps) {
  return (
    <>
      <h1 className="builder-page-title">Workflow Builder</h1>
      <div className="builder-topbar">
        <div className="builder-breadcrumb">
          <span>Workflows</span>
          <strong>{workflowName}</strong>
          <span className="builder-version">v1 {isValid ? 'valid' : 'needs review'}</span>
        </div>
        <div className="builder-toolbar">
          <label className="model-picker">
            <span className="model-label">Provider</span>
            <select
              className="model-select"
              value={provider}
              onChange={(event) => {
                const nextProvider = PROVIDER_OPTIONS.find(
                  ({ value }) => value === event.target.value,
                )?.value;
                if (nextProvider) onProviderChange(nextProvider);
              }}
            >
              {PROVIDER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          {!isCustomProvider ? (
            <label className="model-picker">
              <span className="model-label">Model</span>
              <select
                className="model-select"
                value={model}
                onChange={(event) => {
                  onModelChange(event.target.value);
                  if (event.target.value === CUSTOM_MODEL_OPTION) onOpenSettings();
                }}
              >
                {modelOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <button type="button" className="custom-configure-btn" onClick={onOpenSettings}>
            <span className="custom-configure-icon">⚙</span>
            {isCustomProvider ? customModel || 'Setting' : providerApiKey ? 'Key set' : 'Settings'}
          </button>
        </div>
      </div>

      <div className="builder-statusbar" aria-live="polite">
        <span className={running ? 'builder-status-live' : ''}>{running ? 'Running' : 'Ready to run'}</span>
        <span>
          {nodeCount}/{maxNodes} nodes
        </span>
        <span>{executableNodes} editable steps</span>
        <span>{isValid ? 'Workflow valid' : `${issueCount} issue(s)`}</span>
        <span>{notice}</span>
      </div>
    </>
  );
}
