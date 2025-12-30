import { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { Settings as SettingsIcon } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import SettingsSection from './SettingsSection';
import { useSettings } from './SettingsLayout';
import {
  ACTIONS,
  getActionLabel,
  getActionByKey,
  getVariablesForAction,
  getDefaultTemplate
} from '../../constants/notificationActions';

const TEMPLATE_VARS = [
  { key: 'recipient_name', label: 'Recipient Name', sample: 'John Doe' },
  { key: 'user_name', label: 'User Name', sample: 'Jane Smith' },
  { key: 'user_email', label: 'User Email', sample: 'user@example.com' },
  { key: 'user_role', label: 'User Role', sample: 'Manager' },
  { key: 'client_name', label: 'Client Name', sample: 'Acme Corp' },
  { key: 'client_email', label: 'Client Email', sample: 'client@acme.com' },
  { key: 'client_company', label: 'Client Company', sample: 'Acme Corporation' },
  { key: 'campaign_name', label: 'Campaign Name', sample: 'Summer Promo 2025' },
  { key: 'report_date', label: 'Report Date', sample: '2025-12-01' },
  { key: 'report_url', label: 'Report URL', sample: 'https://example.com/reports/123' },
  { key: 'files_count', label: 'Files Count', sample: '5' },
  { key: 'total_records', label: 'Total Records', sample: '1,234' },
  { key: 'sync_type', label: 'Sync Type', sample: 'Autovation (Mautic)' },
  { key: 'total_clients', label: 'Total Clients', sample: '10' },
  { key: 'successful_clients', label: 'Successful Clients', sample: '9' },
  { key: 'failed_clients', label: 'Failed Clients', sample: '1' },
  { key: 'duration_seconds', label: 'Duration (seconds)', sample: '45.2' },
  { key: 'error_message', label: 'Error Message', sample: 'Connection timeout' },
  { key: 'action_by', label: 'Action Performed By', sample: 'Admin User' },
  { key: 'timestamp', label: 'Timestamp', sample: '2025-12-01 10:30:00' },
  { key: 'company', label: 'Company Name', sample: 'Digital Bevy' },
  { key: 'bounce_rate', label: 'Bounce Rate %', sample: '15.5' },
  { key: 'open_rate', label: 'Open Rate %', sample: '42.3' },
  { key: 'quota_limit', label: 'Quota Limit', sample: '10,000' },
  { key: 'quota_used', label: 'Quota Used', sample: '9,500' }
];

const SAMPLE_MAP = {
  recipient_name: 'John Doe',
  user_name: 'Jane Smith',
  user_email: 'user@example.com',
  user_role: 'Manager',
  client_name: 'Acme Corp',
  client_email: 'client@acme.com',
  client_company: 'Acme Corporation',
  campaign_name: 'Summer Promo 2025',
  report_date: '2025-12-01',
  report_url: 'https://example.com/reports/123',
  files_count: '5',
  total_records: '1,234',
  sync_type: 'Autovation (Mautic)',
  total_clients: '10',
  successful_clients: '9',
  failed_clients: '1',
  duration_seconds: '45.2',
  error_message: 'Connection timeout',
  action_by: 'Admin User',
  timestamp: '2025-12-01 10:30:00',
  company: 'Digital Bevy',
  bounce_rate: '15.5',
  open_rate: '42.3',
  quota_limit: '10,000',
  quota_used: '9,500'
};

const NotificationsSettings = () => {
  const { user } = useAuth();
  const { canAccessSetting } = useSettings();

  const [notifications, setNotifications] = useState([]);
  const [notifLoading, setNotifLoading] = useState(false);
  const [editingNotif, setEditingNotif] = useState(null);
  const [newNotif, setNewNotif] = useState({ action: '', template: '', active: true });
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [emailEnableSaving, setEmailEnableSaving] = useState(false);
  const [activityEmailEnabled, setActivityEmailEnabled] = useState(true);
  const [activityEmailSaving, setActivityEmailSaving] = useState(false);
  const [emailLogs, setEmailLogs] = useState([]);
  const [emailStats, setEmailStats] = useState(null);
  const [showEmailLogs, setShowEmailLogs] = useState(false);
  const [emailLogsLoading, setEmailLogsLoading] = useState(false);
  const [newPreviewOpen, setNewPreviewOpen] = useState(false);
  const [editingPreviewId, setEditingPreviewId] = useState(null);

  useEffect(() => {
    fetchNotifications();
    fetchSettings();
  }, []);

  const renderTemplate = (template) => {
    if (!template) return '';
    return template.replace(/{{\s*([\w\.]+)\s*}}/g, (_, key) => {
      return SAMPLE_MAP[key] ?? `<<${key}>>`;
    });
  };

  const insertVarToNew = (varKey) => {
    setNewNotif(n => ({ ...n, template: (n.template || '') + ` {{${varKey}}}` }));
  };

  const insertVarToEdit = (id, varKey) => {
    setNotifications(prev => prev.map(x => x.id === id ? { ...x, template: (x.template || '') + ` {{${varKey}}}` } : x));
  };

  const fetchSettings = async () => {
    try {
      const response = await axios.get('/api/settings');
      const fetchedSettings = response.data.settings || {};
      setEmailEnabled(fetchedSettings.notifEmailNotifications !== false);
      setActivityEmailEnabled(fetchedSettings.notifActivityEmails !== false);
    } catch (error) {
      console.error('Failed to fetch settings', error);
    }
  };

  const fetchNotifications = async () => {
    setNotifLoading(true);
    try {
      const res = await axios.get('/api/superadmin/notifications');
      if (res.data?.data) setNotifications(res.data.data || []);
      else if (res.data) setNotifications(res.data || []);
    } catch (err) {
      console.warn('Failed to fetch notifications', err);
    } finally {
      setNotifLoading(false);
    }
  };

  const handleCreateNotification = async () => {
    if (!newNotif.action || !newNotif.template) return toast.error('Action and template are required');
    try {
      const res = await axios.post('/api/superadmin/notifications', newNotif);
      if (res.data?.success) {
        toast.success('Notification created');
        setNewNotif({ action: '', template: '', active: true });
        await fetchNotifications();
      } else {
        toast.error(res.data?.message || 'Failed to create notification');
      }
    } catch (err) {
      console.error('Create notification failed', err);
      toast.error(err.response?.data?.message || 'Failed to create notification');
    }
  };

  const handleUpdateNotification = async (id, payload) => {
    try {
      const res = await axios.put(`/api/superadmin/notifications/${id}`, payload);
      if (res.data?.success) {
        toast.success('Notification updated');
        await fetchNotifications();
        setEditingNotif(null);
      } else {
        toast.error(res.data?.message || 'Failed to update notification');
      }
    } catch (err) {
      console.error('Update notification failed', err);
      toast.error(err.response?.data?.message || 'Failed to update notification');
    }
  };

  const handleDeleteNotification = async (id) => {
    if (!window.confirm('Delete this notification?')) return;
    try {
      const res = await axios.delete(`/api/superadmin/notifications/${id}`);
      if (res.data?.success) {
        toast.success('Notification deleted');
        await fetchNotifications();
      } else {
        toast.error(res.data?.message || 'Failed to delete notification');
      }
    } catch (err) {
      console.error('Delete notification failed', err);
      toast.error(err.response?.data?.message || 'Failed to delete notification');
    }
  };

  const handleToggleActive = async (notif) => {
    const payload = { ...notif, active: !notif.active };
    await handleUpdateNotification(notif.id, payload);
  };

  const handleToggleEmailNotifications = async (enabled) => {
    setEmailEnableSaving(true);
    try {
      const res = await axios.put('/api/settings', { notifEmailNotifications: enabled });
      if (res.data?.success) {
        setEmailEnabled(enabled);
        toast.success(`Email notifications ${enabled ? 'enabled' : 'disabled'}`);
        await fetchSettings();
      } else {
        toast.error(res.data?.message || 'Failed to update settings');
      }
    } catch (err) {
      console.error('Toggle email notifications failed', err);
      toast.error(err.response?.data?.message || 'Failed to update settings');
    } finally {
      setEmailEnableSaving(false);
    }
  };

  const handleToggleActivityEmails = async (enabled) => {
    setActivityEmailSaving(true);
    try {
      const res = await axios.put('/api/settings', { notifActivityEmails: enabled });
      if (res.data?.success) {
        setActivityEmailEnabled(enabled);
        toast.success(`Activity email notifications ${enabled ? 'enabled' : 'disabled'}`);
        await fetchSettings();
      } else {
        toast.error(res.data?.message || 'Failed to update settings');
      }
    } catch (err) {
      console.error('Toggle activity emails failed', err);
      toast.error(err.response?.data?.message || 'Failed to update settings');
    } finally {
      setActivityEmailSaving(false);
    }
  };

  const fetchEmailLogs = async () => {
    setEmailLogsLoading(true);
    try {
      const res = await axios.get('/api/superadmin/notifications/logs?limit=50');
      if (res.data?.data) setEmailLogs(res.data.data);
    } catch (err) {
      console.error('Failed to fetch email logs', err);
      toast.error('Failed to load email logs');
    } finally {
      setEmailLogsLoading(false);
    }
  };

  const fetchEmailStats = async () => {
    try {
      const res = await axios.get('/api/superadmin/notifications/stats');
      if (res.data?.data) setEmailStats(res.data.data);
    } catch (err) {
      console.error('Failed to fetch email stats', err);
    }
  };

  const handleSendTestNotification = async (action) => {
    if (!user?.email) {
      toast.error('Your user account must have an email address');
      return;
    }

    const toastId = toast.loading(`Sending test notification...`);
    try {
      const res = await axios.post('/api/superadmin/notifications/test', {
        action,
        recipientEmail: user.email,
        recipientName: user.name
      });

      if (res.data?.success) {
        toast.update(toastId, {
          render: `Test email sent to ${user.email}! Check your inbox.`,
          type: 'success',
          isLoading: false,
          autoClose: 5000
        });
        if (showEmailLogs) {
          await fetchEmailLogs();
          await fetchEmailStats();
        }
      } else {
        toast.update(toastId, {
          render: res.data?.message || 'Failed to send test email',
          type: 'error',
          isLoading: false,
          autoClose: 5000
        });
      }
    } catch (err) {
      console.error('Test notification failed', err);
      toast.update(toastId, {
        render: err.response?.data?.message || 'Failed to send test email',
        type: 'error',
        isLoading: false,
        autoClose: 5000
      });
    }
  };

  if (!canAccessSetting('notifs')) return null;

  return (
    <SettingsSection id="notifs">
      <div className="card">
        <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
          <SettingsIcon className="mr-2" size={20} />
          Notifications
        </h2>

        <div className="mb-4 text-sm text-gray-600">Create and manage notification templates. Use the template textarea to paste message templates.</div>

        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <h3 className="text-base font-semibold text-gray-900 mb-1 flex items-center">
                📧 Global Email Notifications
              </h3>
              <p className="text-sm text-gray-600">
                {emailEnabled
                  ? 'Email notifications are currently enabled. Users will receive emails for active notification templates below.'
                  : 'Email notifications are currently disabled. Enable this to start sending notification emails to users.'}
              </p>
            </div>
            <div className="ml-4">
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={emailEnabled}
                  onChange={(e) => handleToggleEmailNotifications(e.target.checked)}
                  disabled={emailEnableSaving}
                  className="sr-only peer"
                />
                <div className="w-14 h-7 scale-75 bg-gray-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[4px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-blue-600"></div>
                <span className="ml-3 text-sm font-medium text-gray-900">
                  {emailEnableSaving ? 'Updating...' : (emailEnabled ? 'Enabled' : 'Disabled')}
                </span>
              </label>
            </div>
          </div>
        </div>

        <div className="mb-6 p-4 bg-purple-50 border border-purple-200 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <h3 className="text-base font-semibold text-gray-900 mb-1 flex items-center">
                🔔 Activity Email Notifications (Super Admin Only)
              </h3>
              <p className="text-sm text-gray-600">
                {activityEmailEnabled
                  ? 'All super admins will receive real-time email notifications for every activity in the system (user actions, client changes, etc.).'
                  : 'Activity email notifications are disabled. Enable this to send activity alerts to all super admins.'}
              </p>
            </div>
            <div className="ml-4">
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={activityEmailEnabled}
                  onChange={(e) => handleToggleActivityEmails(e.target.checked)}
                  disabled={activityEmailSaving}
                  className="sr-only peer"
                />
                <div className="w-14 h-7 bg-gray-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[4px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-purple-600"></div>
                <span className="ml-3 text-sm font-medium text-gray-900">
                  {activityEmailSaving ? 'Updating...' : (activityEmailEnabled ? 'Enabled' : 'Disabled')}
                </span>
              </label>
            </div>
          </div>
        </div>

        <div className="mb-4 border border-gray-200 rounded-lg p-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-start">
            <div>
              <select className="form-input p-2" value={newNotif.action} onChange={(e) => {
                const action = e.target.value;
                setNewNotif(n => ({ ...n, action }));
              }}>
                <option value="">Select action...</option>
                {ACTIONS.map(a => (
                  <option key={a.key} value={a.key}>{a.label}</option>
                ))}
              </select>
              {newNotif.action && getActionByKey(newNotif.action)?.category && (
                <div className="mt-1 text-xs text-gray-500">
                  Category: {getActionByKey(newNotif.action).category}
                </div>
              )}
              {newNotif.action && getDefaultTemplate(newNotif.action) && (
                <button
                  type="button"
                  onClick={() => setNewNotif(n => ({ ...n, template: getDefaultTemplate(newNotif.action) }))}
                  className="mt-2 px-3 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded text-sm font-medium w-full"
                >
                  Use Default Template
                </button>
              )}
            </div>
            <div className="col-span-1 md:col-span-2">
              {newNotif.action ? (
                <>
                  <div className="mb-2 text-xs font-medium text-gray-700">
                    Available variables for this action:
                  </div>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {getVariablesForAction(newNotif.action).map(varKey => {
                      const varData = TEMPLATE_VARS.find(v => v.key === varKey);
                      return varData ? (
                        <button
                          key={varKey}
                          type="button"
                          onClick={() => insertVarToNew(varKey)}
                          className="px-2 py-1 bg-green-100 hover:bg-green-200 rounded text-xs text-green-800 font-medium"
                          title={`Click to insert {{${varKey}}}`}
                        >
                          {varData.label}
                        </button>
                      ) : null;
                    })}
                  </div>
                </>
              ) : (
                <div className="mb-3 text-xs text-gray-500 italic">
                  Select an action to see available variables
                </div>
              )}
              <textarea placeholder="Template" className="form-input h-24 w-full text-sm" value={newNotif.template} onChange={(e) => setNewNotif(n => ({ ...n, template: e.target.value }))} />
              <div className="mt-2 flex items-center gap-2">
                <button type="button" onClick={() => setNewPreviewOpen(p => !p)} className="btn btn-secondary btn-sm text-sm px-2 py-1">{newPreviewOpen ? 'Hide Preview' : 'Preview'}</button>
                {newPreviewOpen && (
                  <div className="p-3 bg-white border rounded w-full mt-2">
                    <div className="text-xs text-gray-500 mb-1">Rendered preview</div>
                    <div className="whitespace-pre-wrap text-sm text-gray-800">{renderTemplate(newNotif.template)}</div>
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <label className="inline-flex items-center">
                <input type="checkbox" checked={newNotif.active} onChange={(e) => setNewNotif(n => ({ ...n, active: e.target.checked }))} className="mr-2" />
                Active
              </label>
              <button onClick={handleCreateNotification} className="btn btn-primary text-sm">Create New</button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Action</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Template</th>
                <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">Active</th>
                <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">Edit</th>
                <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {notifLoading ? (
                <tr><td colSpan={5} className="p-4 text-center text-sm text-gray-500">Loading...</td></tr>
              ) : notifications.length === 0 ? (
                <tr><td colSpan={5} className="p-4 text-center text-sm text-gray-500">No notifications defined</td></tr>
              ) : (
                notifications.map((n) => (
                  <tr key={n.id}>
                    <td className="px-4 py-2 align-top text-sm text-gray-700">{n.action}</td>
                    <td className="px-4 py-2">
                      {editingNotif === n.id ? (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <select className="form-input flex-1" value={n.action} onChange={(e) => setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, action: e.target.value } : x))}>
                              <option value="">Select action...</option>
                              {ACTIONS.map(a => (
                                <option key={a.key} value={a.key}>{a.label}</option>
                              ))}
                            </select>
                            {n.action && getDefaultTemplate(n.action) && (
                              <button
                                type="button"
                                onClick={() => setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, template: getDefaultTemplate(n.action) } : x))}
                                className="px-3 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded text-sm font-medium whitespace-nowrap"
                              >
                                Use Template
                              </button>
                            )}
                          </div>
                          {n.action && getActionByKey(n.action)?.category && (
                            <div className="text-xs text-gray-500">
                              Category: {getActionByKey(n.action).category}
                            </div>
                          )}
                          {n.action ? (
                            <>
                              <div className="mb-2 text-xs font-medium text-gray-700">Available variables for this action:</div>
                              <div className="flex flex-wrap gap-2 mb-3">
                                {getVariablesForAction(n.action).map(varKey => {
                                  const varData = TEMPLATE_VARS.find(v => v.key === varKey);
                                  return varData ? (
                                    <button
                                      key={varKey}
                                      type="button"
                                      onClick={() => insertVarToEdit(n.id, varKey)}
                                      className="px-2 py-1 bg-green-100 hover:bg-green-200 rounded text-sm text-green-800 font-medium"
                                      title={`Click to insert {{${varKey}}}`}
                                    >
                                      {varData.label}
                                    </button>
                                  ) : null;
                                })}
                              </div>
                            </>
                          ) : (
                            <div className="mb-3 text-xs text-gray-500 italic">
                              Select an action to see available variables
                            </div>
                          )}
                          <textarea className="form-input w-full h-24" value={n.template} onChange={(e) => setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, template: e.target.value } : x))} />
                          <div className="mt-2 flex items-center gap-2">
                            <button type="button" onClick={() => setEditingPreviewId(editingPreviewId === n.id ? null : n.id)} className="btn btn-secondary btn-sm">{editingPreviewId === n.id ? 'Hide Preview' : 'Preview'}</button>
                            {editingPreviewId === n.id && (
                              <div className="p-3 bg-white border rounded w-full mt-2">
                                <div className="text-xs text-gray-500 mb-1">Rendered preview</div>
                                <div className="whitespace-pre-wrap text-sm text-gray-800">{renderTemplate(n.template)}</div>
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div className="text-xs font-medium text-gray-700">{getActionLabel(n.action)}</div>
                          <textarea readOnly className="form-input w-full h-32 text-xs bg-gray-50 mt-2" value={n.template} />
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2 text-center">
                      <input type="checkbox" checked={!!n.active} onChange={() => handleToggleActive(n)} />
                    </td>
                    <td className="px-4 py-2 text-center">
                      {editingNotif === n.id ? (
                        <div className="flex gap-2 justify-center">
                          <button onClick={() => handleUpdateNotification(n.id, n)} className="btn btn-primary btn-sm px-2 py-1">Save</button>
                          <button onClick={() => { setEditingNotif(null); fetchNotifications(); }} className="btn btn-secondary btn-sm px-2 py-1">Cancel</button>
                        </div>
                      ) : (
                        <div className="flex gap-2 justify-center">
                          <button onClick={() => setEditingNotif(n.id)} className="btn btn-secondary btn-sm px-2 py-1">Edit</button>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2 text-center">
                      <div className="flex gap-2 justify-center">
                        <button onClick={() => handleSendTestNotification(n.action)} className="btn btn-sm px-2 py-1 bg-green-600 hover:bg-green-700 text-white" title="Send test email">Test</button>
                        <button onClick={() => handleDeleteNotification(n.id)} className="btn btn-danger btn-sm px-2 py-1">Delete</button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-6 border-t pt-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Email Activity</h3>
            <button
              onClick={() => {
                setShowEmailLogs(!showEmailLogs);
                if (!showEmailLogs) {
                  fetchEmailLogs();
                  fetchEmailStats();
                }
              }}
              className="btn btn-secondary btn-sm"
            >
              {showEmailLogs ? 'Hide' : 'View'} Email Logs
            </button>
          </div>

          {showEmailLogs && (
            <div className="space-y-4">
              {emailStats && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <div className="text-sm text-blue-600 font-medium">Total Sent</div>
                    <div className="text-2xl font-bold text-blue-900">{emailStats.totalSent}</div>
                  </div>
                  <div className="bg-red-50 p-4 rounded-lg">
                    <div className="text-sm text-red-600 font-medium">Failed</div>
                    <div className="text-2xl font-bold text-red-900">{emailStats.totalFailed}</div>
                  </div>
                  <div className="bg-green-50 p-4 rounded-lg">
                    <div className="text-sm text-green-600 font-medium">Success Rate</div>
                    <div className="text-2xl font-bold text-green-900">{emailStats.successRate}%</div>
                  </div>
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <div className="text-sm text-gray-600 font-medium">Total Emails</div>
                    <div className="text-2xl font-bold text-gray-900">{emailStats.totalEmails}</div>
                  </div>
                </div>
              )}

              <div className="overflow-x-auto">
                {emailLogsLoading ? (
                  <div className="text-center py-4 text-gray-500">Loading email logs...</div>
                ) : emailLogs.length === 0 ? (
                  <div className="text-center py-4 text-gray-500">No email logs found</div>
                ) : (
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead>
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Time</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Action</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Recipient</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Status</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Details</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-100">
                      {emailLogs.map((log) => (
                        <tr key={log.id}>
                          <td className="px-4 py-2 text-sm text-gray-600 whitespace-nowrap">
                            {new Date(log.sentAt).toLocaleString()}
                          </td>
                          <td className="px-4 py-2 text-sm text-gray-700">
                            {getActionLabel(log.action)}
                          </td>
                          <td className="px-4 py-2 text-sm text-gray-700">
                            <div>{log.recipientName}</div>
                            <div className="text-xs text-gray-500">{log.recipientEmail}</div>
                          </td>
                          <td className="px-4 py-2 text-sm">
                            {log.success ? (
                              <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs font-medium">✓ Sent</span>
                            ) : (
                              <span className="px-2 py-1 bg-red-100 text-red-800 rounded text-xs font-medium">✗ Failed</span>
                            )}
                          </td>
                          <td className="px-4 py-2 text-xs text-gray-500">
                            {log.success ? (
                              <span title={log.messageId}>ID: {log.messageId?.substring(0, 20)}...</span>
                            ) : (
                              <span className="text-red-600" title={log.errorMessage}>{log.errorMessage?.substring(0, 50)}...</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </SettingsSection>
  );
};

export default NotificationsSettings;
