import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MODEL_OPTIONS_BY_PROVIDER, PROVIDER_OPTIONS, type ModelProvider } from '../registry/examples';

export const CUSTOM_MODEL_OPTION = '__custom_model__';

const PREFERENCE_KEY = 'mpg:llm:v3';
const LEGACY_PREFERENCE_KEYS = ['mpg:llm:v2', 'mpg:llm:v1'];
const DEFAULT_PROVIDER = PROVIDER_OPTIONS[0].value;
const DEFAULT_MODELS = {
  google: MODEL_OPTIONS_BY_PROVIDER.google[0].value,
  openrouter: MODEL_OPTIONS_BY_PROVIDER.openrouter[0].value,
};

type BuiltInProvider = Exclude<ModelProvider, 'custom'>;

interface BuiltInSettings {
  model: string;
  customModel: string;
  apiKey: string;
  useCustomModel: boolean;
}

interface StoredBuiltInSettings {
  model?: unknown;
  customModel?: unknown;
  apiKey?: unknown;
  useCustomModel?: unknown;
}

interface StoredPreferenceV3 {
  provider?: unknown;
  providers?: {
    google?: StoredBuiltInSettings;
    openrouter?: StoredBuiltInSettings;
  };
  custom?: {
    customBaseUrl?: unknown;
    customApiKey?: unknown;
    customModel?: unknown;
  };
}

interface StoredPreferenceLegacy {
  provider?: unknown;
  model?: unknown;
  customBaseUrl?: unknown;
  customApiKey?: unknown;
  customModel?: unknown;
}

const DEFAULT_BUILT_IN_SETTINGS: Record<BuiltInProvider, BuiltInSettings> = {
  google: { model: DEFAULT_MODELS.google, customModel: '', apiKey: '', useCustomModel: false },
  openrouter: { model: DEFAULT_MODELS.openrouter, customModel: '', apiKey: '', useCustomModel: false },
};

function isBuiltInProvider(value: unknown): value is BuiltInProvider {
  return value === 'google' || value === 'openrouter';
}

function savedProvider(value: unknown): ModelProvider | undefined {
  return PROVIDER_OPTIONS.find((option) => option.value === value)?.value;
}

function isPresetModel(provider: BuiltInProvider, value: unknown): value is string {
  return (
    typeof value === 'string' && MODEL_OPTIONS_BY_PROVIDER[provider].some((option) => option.value === value)
  );
}

function normalizeBuiltInSettings(provider: BuiltInProvider, saved?: StoredBuiltInSettings): BuiltInSettings {
  const defaults = DEFAULT_BUILT_IN_SETTINGS[provider];
  const apiKey = typeof saved?.apiKey === 'string' ? saved.apiKey : '';
  const customModel = typeof saved?.customModel === 'string' ? saved.customModel : '';
  const model = isPresetModel(provider, saved?.model) ? saved.model : defaults.model;
  const savedModel = typeof saved?.model === 'string' ? saved.model : undefined;
  const hasMigratedCustomModel = savedModel !== undefined && !isPresetModel(provider, savedModel);
  const migratedCustomModel = hasMigratedCustomModel ? savedModel : customModel;
  const useCustomModel =
    (hasMigratedCustomModel || saved?.useCustomModel === true) && migratedCustomModel.trim().length > 0
      ? true
      : false;

  return {
    model,
    customModel: migratedCustomModel,
    apiKey,
    useCustomModel,
  };
}

export function useModelPreferences() {
  const [provider, setProvider] = useState<ModelProvider>(DEFAULT_PROVIDER);
  const [builtInSettings, setBuiltInSettings] =
    useState<Record<BuiltInProvider, BuiltInSettings>>(DEFAULT_BUILT_IN_SETTINGS);
  const [customBaseUrl, setCustomBaseUrl] = useState('');
  const [customApiKey, setCustomApiKey] = useState('');
  const [customModel, setCustomModel] = useState('');
  const skipNextPreferenceWrite = useRef(true);

  useEffect(() => {
    const saved = localStorage.getItem(PREFERENCE_KEY);
    const legacySaved = LEGACY_PREFERENCE_KEYS.map((key) => localStorage.getItem(key)).find(Boolean);
    const rawPreference = saved ?? legacySaved;

    if (rawPreference) {
      try {
        const parsed = JSON.parse(rawPreference) as StoredPreferenceV3 & StoredPreferenceLegacy;
        const nextProvider = savedProvider(parsed.provider);
        const providers = parsed.providers;

        setBuiltInSettings({
          google: normalizeBuiltInSettings('google', providers?.google),
          openrouter: normalizeBuiltInSettings('openrouter', providers?.openrouter),
        });

        if (!saved && nextProvider && isBuiltInProvider(nextProvider) && typeof parsed.model === 'string') {
          setBuiltInSettings((current) => ({
            ...current,
            [nextProvider]: normalizeBuiltInSettings(nextProvider, {
              model: parsed.model,
            }),
          }));
        }

        if (nextProvider) setProvider(nextProvider);

        const customSettings = parsed.custom ?? parsed;
        if (typeof customSettings.customBaseUrl === 'string') {
          setCustomBaseUrl(customSettings.customBaseUrl);
        }
        if (typeof customSettings.customApiKey === 'string') {
          setCustomApiKey(customSettings.customApiKey);
        }
        if (typeof customSettings.customModel === 'string') {
          setCustomModel(customSettings.customModel);
        }
      } catch {
        localStorage.removeItem(PREFERENCE_KEY);
      }
    }

    for (const key of LEGACY_PREFERENCE_KEYS) localStorage.removeItem(key);
  }, []);

  useEffect(() => {
    if (skipNextPreferenceWrite.current) {
      skipNextPreferenceWrite.current = false;
      return;
    }

    localStorage.setItem(
      PREFERENCE_KEY,
      JSON.stringify({
        provider,
        providers: builtInSettings,
        custom: { customBaseUrl, customApiKey, customModel },
      }),
    );
  }, [provider, builtInSettings, customBaseUrl, customApiKey, customModel]);

  const activeBuiltInSettings =
    provider === 'custom' ? DEFAULT_BUILT_IN_SETTINGS.google : builtInSettings[provider];

  const model = activeBuiltInSettings.useCustomModel ? CUSTOM_MODEL_OPTION : activeBuiltInSettings.model;

  const modelOptions = useMemo(() => {
    if (provider === 'custom') return MODEL_OPTIONS_BY_PROVIDER.custom;
    const label = activeBuiltInSettings.customModel.trim()
      ? `Custom · ${activeBuiltInSettings.customModel.trim()}`
      : 'Custom model…';
    return [...MODEL_OPTIONS_BY_PROVIDER[provider], { value: CUSTOM_MODEL_OPTION, label }];
  }, [activeBuiltInSettings.customModel, provider]);

  const updateBuiltInProvider = useCallback(
    (updater: (settings: BuiltInSettings) => BuiltInSettings, targetProvider = provider) => {
      if (!isBuiltInProvider(targetProvider)) return;
      setBuiltInSettings((current) => ({
        ...current,
        [targetProvider]: updater(current[targetProvider]),
      }));
    },
    [provider],
  );

  const setModel = useCallback(
    (nextModel: string) => {
      updateBuiltInProvider((settings) => {
        if (nextModel === CUSTOM_MODEL_OPTION) {
          return { ...settings, useCustomModel: true };
        }
        return { ...settings, model: nextModel, useCustomModel: false };
      });
    },
    [updateBuiltInProvider],
  );

  const setProviderApiKey = useCallback(
    (apiKey: string) => {
      updateBuiltInProvider((settings) => ({ ...settings, apiKey }));
    },
    [updateBuiltInProvider],
  );

  const setProviderCustomModel = useCallback(
    (nextCustomModel: string) => {
      updateBuiltInProvider((settings) => ({
        ...settings,
        customModel: nextCustomModel,
        useCustomModel: nextCustomModel.trim().length > 0 ? true : settings.useCustomModel,
      }));
    },
    [updateBuiltInProvider],
  );

  const selectProvider = useCallback((nextProvider: ModelProvider) => {
    setProvider(nextProvider);
  }, []);

  const clearCurrentProviderSettings = useCallback(() => {
    if (provider === 'custom') {
      setCustomBaseUrl('');
      setCustomApiKey('');
      setCustomModel('');
      return;
    }
    updateBuiltInProvider(() => DEFAULT_BUILT_IN_SETTINGS[provider]);
  }, [provider, updateBuiltInProvider]);

  const clearAllSettings = useCallback(() => {
    skipNextPreferenceWrite.current = true;
    setProvider(DEFAULT_PROVIDER);
    setBuiltInSettings(DEFAULT_BUILT_IN_SETTINGS);
    setCustomBaseUrl('');
    setCustomApiKey('');
    setCustomModel('');
    localStorage.removeItem(PREFERENCE_KEY);
    for (const key of LEGACY_PREFERENCE_KEYS) localStorage.removeItem(key);
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
        const settings = builtInSettings[provider];
        const resolvedModel = settings.useCustomModel
          ? settings.customModel.trim() || settings.model
          : settings.model;
        body.model = resolvedModel;
        if (settings.apiKey.trim()) body.providerApiKey = settings.apiKey.trim();
      }
      return body;
    },
    [provider, customBaseUrl, customApiKey, customModel, builtInSettings],
  );

  return {
    provider,
    model,
    providerApiKey: activeBuiltInSettings.apiKey,
    providerCustomModel: activeBuiltInSettings.customModel,
    useCustomModel: activeBuiltInSettings.useCustomModel,
    customBaseUrl,
    customApiKey,
    customModel,
    modelOptions,
    setModel,
    setProviderApiKey,
    setProviderCustomModel,
    setCustomBaseUrl,
    setCustomApiKey,
    setCustomModel,
    selectProvider,
    clearCurrentProviderSettings,
    clearAllSettings,
    addToRequest,
  };
}
