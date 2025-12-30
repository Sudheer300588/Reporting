import { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { Settings as SettingsIcon, Save, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import SettingsSection from './SettingsSection';
import { useSettings } from './SettingsLayout';

const smtpDefault = {
  host: '',
  port: 587,
  username: '',
  password: '',
  fromAddress: ''
};

const SmtpCredentials = () => {
  const { user } = useAuth();
  const { canAccessSetting } = useSettings();
  const [smtp, setSmtp] = useState(smtpDefault);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    fetchSmtpCred();
  }, []);

  const fetchSmtpCred = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/superadmin/smtp-credentials');
      if (res.data?.data) setSmtp({ ...smtpDefault, ...res.data.data });
    } catch (err) {
      console.error("Error fetching SMTP credentials", err);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setSmtp((prev) => ({ ...prev, [name]: value }));
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const trimmed = {
        host: smtp.host.trim(),
        port: smtp.port,
        username: smtp.username.trim(),
        password: smtp.password.trim(),
        fromAddress: smtp.fromAddress.trim()
      };
      await axios.post('/api/superadmin/smtp-credentials', trimmed);
      toast.success('SMTP credentials saved successfully');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save SMTP credentials');
    } finally {
      setLoading(false);
    }
  };

  const handleTestEmail = async () => {
    if (!smtp.host || !smtp.username || !smtp.password || !smtp.fromAddress) {
      toast.error('Please fill in all SMTP fields before testing');
      return;
    }

    const toastId = toast.loading('Sending test email...');
    try {
      const res = await axios.post('/api/superadmin/smtp-credentials/test', {
        host: smtp.host.trim(),
        port: smtp.port,
        username: smtp.username.trim(),
        password: smtp.password.trim(),
        fromAddress: smtp.fromAddress.trim(),
        toAddress: user?.email || smtp.fromAddress
      });
      
      if (res.data?.success) {
        toast.update(toastId, { 
          render: `Test email sent successfully to ${user?.email || smtp.fromAddress}`, 
          type: 'success', 
          isLoading: false, 
          autoClose: 5000 
        });
      } else {
        toast.update(toastId, { 
          render: res.data?.message || 'Test email failed', 
          type: 'error', 
          isLoading: false, 
          autoClose: 5000 
        });
      }
    } catch (err) {
      toast.update(toastId, { 
        render: err.response?.data?.message || 'Failed to send test email', 
        type: 'error', 
        isLoading: false, 
        autoClose: 5000 
      });
    }
  };

  if (!canAccessSetting('smtp')) return null;

  return (
    <SettingsSection id="smtp">
      <div className="card">
        <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
          <SettingsIcon className="mr-2" size={20} />
          SMTP Credentials
        </h2>
        <p className="text-sm text-gray-600 mb-6">
          Configure your SMTP server for sending email notifications.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">SMTP Host</label>
            <input
              type="text"
              name="host"
              value={smtp.host}
              onChange={handleChange}
              className="input"
              placeholder="smtp.example.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Port</label>
            <input
              type="number"
              name="port"
              value={smtp.port}
              onChange={handleChange}
              className="input"
              placeholder="587"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
            <input
              type="text"
              name="username"
              value={smtp.username}
              onChange={handleChange}
              className="input"
              placeholder="user@example.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                name="password"
                value={smtp.password}
                onChange={handleChange}
                className="input pr-10"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">From Address</label>
            <input
              type="email"
              name="fromAddress"
              value={smtp.fromAddress}
              onChange={handleChange}
              className="input"
              placeholder="noreply@example.com"
            />
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <button
            onClick={handleSave}
            className="btn btn-primary flex items-center"
            disabled={loading}
          >
            <Save size={16} className="mr-2" />
            {loading ? 'Saving...' : 'Save Credentials'}
          </button>
          <button
            onClick={handleTestEmail}
            className="btn btn-secondary"
            disabled={loading}
          >
            Send Test Email
          </button>
        </div>
      </div>
    </SettingsSection>
  );
};

export default SmtpCredentials;
