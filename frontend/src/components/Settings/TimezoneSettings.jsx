import { useState } from 'react';
import { Globe, Save, CheckCircle } from 'lucide-react';
import { toast } from 'react-toastify';
import { useAuth } from '../../contexts/AuthContext';
import { TIMEZONE_OPTIONS } from '../../contexts/TimezoneContext';
import SettingsSection from './SettingsSection';

const TimezoneSettings = () => {
  const { user, updateTimezone } = useAuth();
  const [selectedTz, setSelectedTz] = useState(user?.timezone || 'America/Los_Angeles');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    if (selectedTz === user?.timezone) {
      toast.info('No changes to save');
      return;
    }
    setSaving(true);
    setSaved(false);
    try {
      await updateTimezone(selectedTz);
      setSaved(true);
      toast.success('Timezone updated successfully');
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to update timezone');
    } finally {
      setSaving(false);
    }
  };

  // Current time preview in selected timezone
  const previewTime = () => {
    try {
      return new Date().toLocaleString('en-US', {
        timeZone: selectedTz,
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      });
    } catch {
      return 'Invalid timezone';
    }
  };

  return (
    <SettingsSection id="timezone">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-indigo-50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Globe className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Timezone</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                All dates and times across the application will display in your selected timezone.
              </p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-6 space-y-5">
          {/* Selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Timezone
            </label>
            <select
              value={selectedTz}
              onChange={(e) => { setSelectedTz(e.target.value); setSaved(false); }}
              className="w-full max-w-lg px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
            >
              {TIMEZONE_OPTIONS.map((tz) => (
                <option key={tz.value} value={tz.value}>
                  {tz.label}
                </option>
              ))}
            </select>
          </div>

          {/* Live preview */}
          <div className="flex items-center gap-2 text-sm text-gray-600 bg-gray-50 rounded-lg px-4 py-3 border border-gray-200">
            <Globe size={15} className="text-gray-400 flex-shrink-0" />
            <span className="font-medium text-gray-700">Current time in selected timezone:</span>
            <span className="font-mono text-blue-700">{previewTime()}</span>
          </div>

          {/* Save button */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saving || selectedTz === user?.timezone}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-lg text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
            >
              {saving ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
              ) : saved ? (
                <CheckCircle size={16} />
              ) : (
                <Save size={16} />
              )}
              {saving ? 'Saving…' : saved ? 'Saved!' : 'Save Timezone'}
            </button>
            {selectedTz === user?.timezone && !saving && (
              <span className="text-sm text-gray-400">This is your current timezone</span>
            )}
          </div>
        </div>
      </div>
    </SettingsSection>
  );
};

export default TimezoneSettings;
