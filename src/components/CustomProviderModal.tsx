import { useEffect } from 'react';

interface CustomProviderModalProps {
  baseUrl: string;
  apiKey: string;
  model: string;
  onBaseUrlChange: (value: string) => void;
  onApiKeyChange: (value: string) => void;
  onModelChange: (value: string) => void;
  onClear: () => void;
  onClose: () => void;
}

export function CustomProviderModal({
  baseUrl,
  apiKey,
  model,
  onBaseUrlChange,
  onApiKeyChange,
  onModelChange,
  onClear,
  onClose,
}: CustomProviderModalProps) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      className="custom-modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-label="Custom provider settings"
    >
      <div className="custom-modal" onClick={(event) => event.stopPropagation()}>
        <div className="custom-modal-header">
          <h2 className="custom-modal-title">Custom Endpoint</h2>
          <button
            type="button"
            className="icon-btn"
            title="Close (Esc)"
            aria-label="Close custom provider settings"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        <div className="custom-modal-body">
          <label className="custom-modal-field">
            <span className="custom-modal-label">Base URL</span>
            <input
              type="url"
              className="custom-modal-input"
              placeholder="https://api.example.com/v1"
              value={baseUrl}
              onChange={(event) => onBaseUrlChange(event.target.value)}
              spellCheck={false}
              autoComplete="off"
              autoFocus
            />
          </label>
          <label className="custom-modal-field">
            <span className="custom-modal-label">Model ID</span>
            <input
              type="text"
              className="custom-modal-input"
              placeholder="gpt-4o-mini"
              value={model}
              onChange={(event) => onModelChange(event.target.value)}
              spellCheck={false}
              autoComplete="off"
            />
          </label>
          <label className="custom-modal-field">
            <span className="custom-modal-label">API Key</span>
            <input
              type="password"
              className="custom-modal-input"
              placeholder="sk-..."
              value={apiKey}
              onChange={(event) => onApiKeyChange(event.target.value)}
              autoComplete="off"
            />
          </label>
          <p className="custom-modal-warning">
            ⚠ Credentials are stored in localStorage. HTTP endpoints transmit them without TLS.
          </p>
        </div>
        <div className="custom-modal-footer">
          <button type="button" className="custom-modal-clear-btn" onClick={onClear}>
            Clear all
          </button>
          <button type="button" className="custom-modal-done-btn" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
