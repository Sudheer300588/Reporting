import { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { Bot, Key, Volume2, Loader2, Check, AlertCircle } from 'lucide-react';
import { useSettings } from './SettingsLayout';
import SettingsSection from './SettingsSection';

const LLM_PROVIDERS = [
  { id: 'openai', name: 'OpenAI' },
  { id: 'anthropic', name: 'Anthropic (Claude)' },
];

const AISettings = () => {
  const { canAccessSetting } = useSettings();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState({
    llmProvider: 'openai',
    llmApiKey: '',
    llmModel: 'gpt-4o-mini',
    voiceProvider: 'elevenlabs',
    voiceApiKey: '',
    voiceId: '',
    assistantName: 'Bevy',
    isEnabled: false,
  });
  const [models, setModels] = useState({});
  const [voices, setVoices] = useState([]);
  const [loadingVoices, setLoadingVoices] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const res = await axios.get('/api/ai/settings');
      if (res.data.success) {
        setSettings(res.data.settings);
        setModels(res.data.models || {});
      }
    } catch (error) {
      console.error('Failed to fetch AI settings', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchVoices = async () => {
    setLoadingVoices(true);
    try {
      const res = await axios.get('/api/ai/voices');
      if (res.data.success) {
        setVoices(res.data.voices || []);
      }
    } catch (error) {
      console.error('Failed to fetch voices', error);
    } finally {
      setLoadingVoices(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await axios.put('/api/ai/settings', settings);
      if (res.data.success) {
        toast.success('AI settings saved successfully');
        setSettings(res.data.settings);
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to save AI settings');
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (field, value) => {
    setSettings(prev => ({ ...prev, [field]: value }));
  };

  if (!canAccessSetting('ai')) {
    return null;
  }

  if (loading) {
    return (
      <SettingsSection id="ai">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
        </div>
      </SettingsSection>
    );
  }

  const currentModels = models[settings.llmProvider] || [];

  return (
    <SettingsSection id="ai">
      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Bot className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">AI Assistant</h2>
              <p className="text-sm text-gray-500">Configure your AI-powered assistant</p>
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={settings.isEnabled}
              onChange={(e) => handleChange('isEnabled', e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
            <span className="ml-3 text-sm font-medium text-gray-900">
              {settings.isEnabled ? 'Enabled' : 'Disabled'}
            </span>
          </label>
        </div>

        <div className="space-y-6">
          <div className="p-4 bg-gray-50 rounded-lg">
            <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
              <Key className="w-4 h-4" />
              LLM Configuration
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Provider</label>
                <select
                  value={settings.llmProvider}
                  onChange={(e) => handleChange('llmProvider', e.target.value)}
                  className="form-input w-full"
                >
                  {LLM_PROVIDERS.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Model</label>
                <select
                  value={settings.llmModel}
                  onChange={(e) => handleChange('llmModel', e.target.value)}
                  className="form-input w-full"
                >
                  {currentModels.map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">API Key</label>
                <input
                  type="password"
                  value={settings.llmApiKey || ''}
                  onChange={(e) => handleChange('llmApiKey', e.target.value)}
                  placeholder="Enter your API key"
                  className="form-input w-full"
                />
                <p className="mt-1 text-xs text-gray-500">
                  {settings.llmProvider === 'openai' 
                    ? 'Get your API key from platform.openai.com'
                    : 'Get your API key from console.anthropic.com'}
                </p>
              </div>
            </div>
          </div>

          <div className="p-4 bg-gray-50 rounded-lg">
            <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
              <Volume2 className="w-4 h-4" />
              Voice Configuration (Optional)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">ElevenLabs API Key</label>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={settings.voiceApiKey || ''}
                    onChange={(e) => handleChange('voiceApiKey', e.target.value)}
                    placeholder="Enter your ElevenLabs API key"
                    className="form-input flex-1"
                  />
                  <button
                    onClick={fetchVoices}
                    disabled={loadingVoices || !settings.voiceApiKey}
                    className="btn btn-secondary"
                  >
                    {loadingVoices ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Load Voices'}
                  </button>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  Get your API key from elevenlabs.io
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Voice</label>
                <select
                  value={settings.voiceId || ''}
                  onChange={(e) => handleChange('voiceId', e.target.value)}
                  className="form-input w-full"
                  disabled={voices.length === 0}
                >
                  <option value="">Select a voice...</option>
                  {voices.map(v => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Assistant Name</label>
                <input
                  type="text"
                  value={settings.assistantName || ''}
                  onChange={(e) => handleChange('assistantName', e.target.value)}
                  placeholder="Bevy"
                  className="form-input w-full"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Used for wake word: "Hey {settings.assistantName || 'Bevy'}"
                </p>
              </div>
            </div>
          </div>

          {settings.isEnabled && !settings.llmApiKey && (
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-yellow-600" />
              <span className="text-sm text-yellow-800">
                Please enter an API key to enable the AI assistant
              </span>
            </div>
          )}

          <div className="flex justify-end">
            <button
              onClick={handleSave}
              disabled={saving}
              className="btn btn-primary flex items-center gap-2"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Save Settings
            </button>
          </div>
        </div>
      </div>
    </SettingsSection>
  );
};

export default AISettings;
