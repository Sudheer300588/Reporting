import { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { Settings as SettingsIcon, Save, Eye, EyeOff } from 'lucide-react';
import SettingsSection from './SettingsSection';
import { useSettings } from './SettingsLayout';

const vicidialDefault = {
  url: '',
  username: '',
  password: ''
};

const VicidialCredentials = () => {
  const { canAccessSetting } = useSettings();
  const [vicidial, setVicidial] = useState(vicidialDefault);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    fetchVicidialCred();
  }, []);

  const fetchVicidialCred = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/superadmin/vicidial-credentials');
      if (res.data?.data) setVicidial({ ...vicidialDefault, ...res.data.data });
    } catch (err) {
      console.error("Error fetching Vicidial credentials", err);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setVicidial((prev) => ({ ...prev, [name]: value }));
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const trimmed = {
        url: vicidial.url.trim(),
        username: vicidial.username.trim(),
        password: vicidial.password.trim()
      };
      await axios.post('/api/superadmin/vicidial-credentials', trimmed);
      toast.success('Vicidial credentials saved successfully');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save Vicidial credentials');
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async () => {
    if (!vicidial.url || !vicidial.username || !vicidial.password) {
      toast.error('Please fill in all Vicidial fields before testing');
      return;
    }

    setTesting(true);
    const toastId = toast.loading('Testing Vicidial connection...');
    try {
      const res = await axios.post('/api/superadmin/vicidial-credentials/test', {
        url: vicidial.url.trim(),
        username: vicidial.username.trim(),
        password: vicidial.password.trim()
      });
      
      if (res.data?.success) {
        toast.update(toastId, { 
          render: 'Vicidial connection successful!', 
          type: 'success', 
          isLoading: false, 
          autoClose: 5000 
        });
      } else {
        toast.update(toastId, { 
          render: res.data?.message || 'Vicidial connection failed', 
          type: 'error', 
          isLoading: false, 
          autoClose: 5000 
        });
      }
    } catch (err) {
      toast.update(toastId, { 
        render: err.response?.data?.message || 'Failed to test Vicidial connection', 
        type: 'error', 
        isLoading: false, 
        autoClose: 5000 
      });
    } finally {
      setTesting(false);
    }
  };

  if (!canAccessSetting('vicidial')) return null;

  return (
    <SettingsSection id="vicidial">
      <div className="card">
        <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
          <SettingsIcon className="mr-2" size={20} />
          Vicidial Credentials
        </h2>
        <p className="text-sm text-gray-600 mb-6">
          Configure connection to your Vicidial call center system.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Vicidial URL</label>
            <input
              type="text"
              name="url"
              value={vicidial.url}
              onChange={handleChange}
              className="input"
              placeholder="https://vicidial.example.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
            <input
              type="text"
              name="username"
              value={vicidial.username}
              onChange={handleChange}
              className="input"
              placeholder="admin"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                name="password"
                value={vicidial.password}
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
            onClick={handleTest}
            className="btn btn-secondary"
            disabled={testing || loading}
          >
            {testing ? 'Testing...' : 'Test Connection'}
          </button>
        </div>
      </div>
    </SettingsSection>
  );
};

export default VicidialCredentials;
