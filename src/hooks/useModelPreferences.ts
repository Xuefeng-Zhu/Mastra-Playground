import { useCallback, useEffect, useRef, useState } from 'react';
import { MODEL_OPTIONS_BY_PROVIDER, PROVIDER_OPTIONS, type ModelProvider } from '../registry/examples';

const PREFERENCE_KEY = 'mpg:llm:v2';
const LEGACY_PREFERENCE_KEY = 'mpg:llm:v1';
const DEFAULT_PROVIDER = PROVIDER_OPTIONS[0].value;
const DEFAULT_MODEL = MODEL_OPTIONS_BY_PROVIDER[DEFAULT_PROVIDER][0].value;

interface StoredPreference {
  provider?: unknown;
  model?: unknown;
  customBaseUrl?: unknown;
  customApiKey?: unknown;
  customModel?: unknown;
}

export function useModelPreferences() {
  const [provider, setProvider] = useState<ModelProvider>(DEFAULT_PROVIDER);
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [customBaseUrl, setCustomBaseUrl] = useState('');
  const [customApiKey, setCustomApiKey] = useState('');
  const [customModel, setCustomModel] = useState('');
  const skipNextPreferenceWrite = useRef(true);

  useEffect(() => {
    const saved = localStorage.getItem(PREFERENCE_KEY) ?? localStorage.getItem(LEGACY_PREFERENCE_KEY);
    if (saved) {
      try {
        const preference = JSON.parse(saved) as StoredPreference;
        const savedProvider = PROVIDER_OPTIONS.find(({ value }) => value === preference.provider)?.value;
        if (savedProvider === 'custom') {
          setProvider(savedProvider);
          if (typeof preference.customBaseUrl === 'string') setCustomBaseUrl(preference.customBaseUrl);
          if (typeof preference.customApiKey === 'string') setCustomApiKey(preference.customApiKey);
          if (typeof preference.customModel === 'string') setCustomModel(preference.customModel);
        } else if (
          savedProvider &&
          typeof preference.model === 'string' &&
          MODEL_OPTIONS_BY_PROVIDER[savedProvider].some(({ value }) => value === preference.model)
        ) {
          setProvider(savedProvider);
          setModel(preference.model);
        }
      } catch {
        localStorage.removeItem(PREFERENCE_KEY);
      }
    }
    localStorage.removeItem(LEGACY_PREFERENCE_KEY);
  }, []);

  useEffect(() => {
    if (skipNextPreferenceWrite.current) {
      skipNextPreferenceWrite.current = false;
      return;
    }
    const preference =
      provider === 'custom' ? { provider, customBaseUrl, customApiKey, customModel } : { provider, model };
    localStorage.setItem(PREFERENCE_KEY, JSON.stringify(preference));
  }, [provider, model, customBaseUrl, customApiKey, customModel]);

  const selectProvider = useCallback((nextProvider: ModelProvider) => {
    setProvider(nextProvider);
    if (nextProvider !== 'custom') setModel(MODEL_OPTIONS_BY_PROVIDER[nextProvider][0].value);
  }, []);

  const clearCustomSettings = useCallback(() => {
    skipNextPreferenceWrite.current = true;
    setProvider(DEFAULT_PROVIDER);
    setModel(DEFAULT_MODEL);
    setCustomBaseUrl('');
    setCustomApiKey('');
    setCustomModel('');
    localStorage.removeItem(PREFERENCE_KEY);
    localStorage.removeItem(LEGACY_PREFERENCE_KEY);
  }, []);

  const addToRequest = useCallback(
    (body: Record<string, unknown>) => {
      body.provider = provider;
      if (provider === 'custom') {
        body.customBaseUrl = customBaseUrl;
        body.customApiKey = customApiKey;
        body.customModel = customModel;
        body.model = customModel;
      } else {
        body.model = model;
      }
      return body;
    },
    [provider, model, customBaseUrl, customApiKey, customModel],
  );

  return {
    provider,
    model,
    customBaseUrl,
    customApiKey,
    customModel,
    modelOptions: MODEL_OPTIONS_BY_PROVIDER[provider],
    setModel,
    setCustomBaseUrl,
    setCustomApiKey,
    setCustomModel,
    selectProvider,
    clearCustomSettings,
    addToRequest,
  };
}
