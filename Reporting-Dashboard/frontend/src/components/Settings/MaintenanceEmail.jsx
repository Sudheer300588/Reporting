import { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { Settings as SettingsIcon } from 'lucide-react';
import SettingsSection from './SettingsSection';
import { useSettings } from './SettingsLayout';

const SAMPLE_MAP = {
  recipient_name: 'John Doe',
  user_name: 'Jane Smith',
  user_email: 'user@example.com'
};

const MaintenanceEmail = () => {
  const { canAccessSetting } = useSettings();

  const [maintenanceTemplate, setMaintenanceTemplate] = useState({ subject: '', body: '' });
  const [sendingMaintenance, setSendingMaintenance] = useState(false);
  const [maintenanceResult, setMaintenanceResult] = useState(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [savedTemplates, setSavedTemplates] = useState([]);
  const [templateName, setTemplateName] = useState('');
  const [smtpConfigured, setSmtpConfigured] = useState(false);

  useEffect(() => {
    loadSavedTemplates();
    checkSmtpStatus();
  }, []);

  const checkSmtpStatus = async () => {
    try {
      const res = await axios.get('/api/superadmin/smtp-credentials');
      if (res.data?.data?.host && res.data?.data?.fromAddress) {
        setSmtpConfigured(true);
      }
    } catch (err) {
      console.warn('Failed to check SMTP status', err);
    }
  };

  const renderTemplate = (template) => {
    if (!template) return '';
    return template.replace(/{{\s*([\w\.]+)\s*}}/g, (_, key) => {
      return SAMPLE_MAP[key] ?? `<<${key}>>`;
    });
  };

  const loadSavedTemplates = () => {
    try {
      const raw = localStorage.getItem('maintenance_templates');
      if (raw) setSavedTemplates(JSON.parse(raw));
    } catch (e) {
      console.warn('Failed to load saved templates', e);
    }
  };

  const saveTemplateLocally = () => {
    if (!templateName?.trim()) return toast.error('Please provide a name to save the template');
    const list = Array.isArray(savedTemplates) ? [...savedTemplates] : [];
    list.unshift({ name: templateName.trim(), subject: maintenanceTemplate.subject, body: maintenanceTemplate.body, createdAt: Date.now() });
    const trimmed = list.slice(0, 10);
    try {
      localStorage.setItem('maintenance_templates', JSON.stringify(trimmed));
      setSavedTemplates(trimmed);
      setTemplateName('');
      toast.success('Template saved locally');
    } catch (e) {
      console.error('Failed to save template locally', e);
      toast.error('Failed to save template');
    }
  };

  const applySavedTemplate = (idx) => {
    const t = savedTemplates[idx];
    if (!t) return;
    setMaintenanceTemplate({ subject: t.subject || '', body: t.body || '' });
    toast.info(`Loaded template: ${t.name}`);
  };

  const deleteSavedTemplate = (idx) => {
    const list = [...savedTemplates];
    const removed = list.splice(idx, 1);
    try {
      localStorage.setItem('maintenance_templates', JSON.stringify(list));
      setSavedTemplates(list);
      toast.success(`Deleted: ${removed[0]?.name || 'template'}`);
    } catch (e) {
      console.error('Failed to delete template', e);
      toast.error('Failed to delete template');
    }
  };

  const handleSendMaintenanceEmail = async () => {
    if (!maintenanceTemplate.subject?.trim() || !maintenanceTemplate.body?.trim()) {
      toast.error('Please provide both subject and email body');
      return;
    }

    setSendingMaintenance(true);
    setMaintenanceResult(null);

    try {
      const res = await axios.post('/api/superadmin/send-maintenance-email', {
        subject: maintenanceTemplate.subject,
        template: maintenanceTemplate.body
      });

      if (res.data?.success) {
        const data = res.data.data;
        const message = `✓ Successfully sent to ${data.successCount} users${data.failureCount > 0 ? `, ${data.failureCount} failed` : ''}`;
        setMaintenanceResult({ success: true, message });
        toast.success(message);
      } else {
        const errorMsg = res.data?.message || 'Failed to send maintenance email';
        setMaintenanceResult({ success: false, message: errorMsg });
        toast.error(errorMsg);
      }
    } catch (err) {
      console.error('Send maintenance email failed:', err);
      const errorMsg = err.response?.data?.message || 'Failed to send maintenance email';
      setMaintenanceResult({ success: false, message: errorMsg });
      toast.error(errorMsg);
    } finally {
      setSendingMaintenance(false);
    }
  };

  if (!canAccessSetting('maintenance')) return null;

  return (
    <SettingsSection id="maintenance">
      <div className="card">
        <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
          <SettingsIcon className="mr-2" size={20} />
          System Maintenance Email
        </h2>

        <div className="mb-4 text-sm text-gray-600">
          Send a notification email to all active users in the system using a template.
        </div>

        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg mb-4">
          <div className="flex items-start">
            <span className="text-2xl mr-3">⚠️</span>
            <div className="text-sm text-yellow-800">
              <p className="font-medium mb-1">This will send an email to ALL active users in the system.</p>
              <p>Make sure SMTP is configured and the template is properly set before sending.</p>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Email Subject <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              className="form-input w-full"
              placeholder="e.g., System Maintenance Notification"
              value={maintenanceTemplate.subject}
              onChange={(e) => setMaintenanceTemplate(prev => ({ ...prev, subject: e.target.value }))}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Email Body <span className="text-red-500">*</span>
            </label>
            <textarea
              className="form-input w-full h-64"
              placeholder="Write your message here. You can use variables like {{recipient_name}}, {{user_email}}, etc."
              value={maintenanceTemplate.body}
              onChange={(e) => setMaintenanceTemplate(prev => ({ ...prev, body: e.target.value }))}
            />
            <div className="mt-2 text-xs text-gray-500">
              <strong>Available variables:</strong> {'{{recipient_name}}, {{user_name}}, {{user_email}}'}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-start">
            <div className="md:col-span-2 flex gap-2">
              <input
                type="text"
                className="form-input w-full"
                placeholder="Save template as (optional)"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
              />
              <button onClick={saveTemplateLocally} className="btn btn-secondary">Save</button>
            </div>

            <div className="flex items-center gap-2 justify-end">
              {savedTemplates && savedTemplates.length > 0 && (
                <div className="flex items-center gap-2">
                  <select className="form-input" onChange={(e) => applySavedTemplate(e.target.value)}>
                    <option value="">Load saved...</option>
                    {savedTemplates.map((t, i) => (
                      <option key={t.createdAt || i} value={i}>{t.name}</option>
                    ))}
                  </select>
                  <button onClick={() => { const idx = prompt('Enter index to delete (0 is newest):'); if (idx !== null) deleteSavedTemplate(parseInt(idx)); }} className="btn btn-ghost">Delete</button>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 mt-3">
            <button
              onClick={() => setShowPreviewModal(true)}
              disabled={!maintenanceTemplate.subject?.trim() || !maintenanceTemplate.body?.trim()}
              className="btn btn-outline"
            >
              🔍 Preview
            </button>

            <div className="ml-auto flex items-center gap-3">
              <div className={`px-3 py-1 rounded text-sm ${smtpConfigured ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                {smtpConfigured ? 'SMTP configured' : 'SMTP not configured'}
              </div>

              <button
                onClick={handleSendMaintenanceEmail}
                disabled={!maintenanceTemplate.subject?.trim() || !maintenanceTemplate.body?.trim() || sendingMaintenance || !smtpConfigured}
                className="btn btn-primary flex items-center"
              >
                {sendingMaintenance ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Sending...
                  </>
                ) : (
                  <>
                    📧 Send to All Users
                  </>
                )}
              </button>
            </div>
          </div>

          {maintenanceResult && (
            <div className={`text-sm mt-3 ${maintenanceResult.success ? 'text-green-600' : 'text-red-600'}`}>
              {maintenanceResult.message}
            </div>
          )}

          {showPreviewModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
              <div className="bg-white rounded-lg max-w-2xl w-full p-6">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold">Preview Email</h3>
                  <button onClick={() => setShowPreviewModal(false)} className="text-gray-600">Close</button>
                </div>
                <div className="mb-3 text-sm text-gray-600 font-medium">Subject</div>
                <div className="mb-4 text-gray-800 font-semibold">{renderTemplate(maintenanceTemplate.subject)}</div>
                <div className="mb-3 text-sm text-gray-600 font-medium">Body</div>
                <div className="whitespace-pre-wrap text-gray-800 border p-3 rounded" style={{maxHeight: '60vh', overflow: 'auto'}}>
                  {renderTemplate(maintenanceTemplate.body)}
                </div>
                <div className="mt-4 flex justify-end">
                  <button onClick={() => setShowPreviewModal(false)} className="btn btn-primary">Close</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </SettingsSection>
  );
};

export default MaintenanceEmail;
