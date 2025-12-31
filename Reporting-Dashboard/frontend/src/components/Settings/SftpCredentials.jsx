import { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { Settings as SettingsIcon, Save, Eye, EyeOff, RefreshCw } from 'lucide-react';
import { useManualFetch, useMetrics, useSyncLogs } from '../../hooks/dropCowboy';
import SettingsSection from './SettingsSection';
import { useSettings } from './SettingsLayout';

const sftpDefault = {
  host: '',
  port: 22,
  username: '',
  password: '',
  remotePath: '/reports'
};

const SftpCredentials = () => {
  const { canAccessSetting } = useSettings();
  const [sftp, setSftp] = useState(sftpDefault);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const { triggerFetch, isFetching } = useManualFetch();
  const { refetch: refetchMetrics } = useMetrics();
  const { refetch: refetchSyncLogs } = useSyncLogs();

  useEffect(() => {
    fetchSftpCred();
  }, []);

  const fetchSftpCred = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/superadmin/sftp-credentials');
      if (res.data?.data) setSftp({ ...sftpDefault, ...res.data.data });
    } catch (err) {
      console.error("Error fetching SFTP credentials", err);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setSftp((prev) => ({ ...prev, [name]: value }));
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const trimmed = {
        host: sftp.host.trim(),
        port: sftp.port,
        username: sftp.username.trim(),
        password: sftp.password.trim(),
        remotePath: sftp.remotePath.trim()
      };
      await axios.post('/api/superadmin/sftp-credentials', trimmed);
      toast.success('SFTP credentials saved');
      
      toast.info('Starting SFTP sync... This may take 30-60 seconds.', { autoClose: 3000 });
      const result = await triggerFetch();

      if (result.success) {
        try {
          await refetchMetrics();
          await refetchSyncLogs();
        } catch (e) {
          console.warn('Failed to refresh DropCowboy data after fetch', e);
        }

        if (result.data?.warning) {
          toast.warning(result.data.warning, { autoClose: 5000 });
        } else if (result.data?.filesDownloaded > 0) {
          toast.success(`Successfully fetched ${result.data.filesDownloaded} files from SFTP!`, { autoClose: 5000 });
        } else {
          toast.info('Sync completed - using existing data.', { autoClose: 3000 });
        }
      } else {
        toast.error('Failed to fetch data: ' + (result.error || 'Unknown error'), { autoClose: 5000 });
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save SFTP credentials');
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async () => {
    if (!sftp.host || !sftp.username || !sftp.password) {
      toast.error('Please fill in all SFTP fields before testing');
      return;
    }

    setTesting(true);
    const toastId = toast.loading('Testing SFTP connection...');
    try {
      const res = await axios.post('/api/superadmin/sftp-credentials/test', {
        host: sftp.host.trim(),
        port: sftp.port,
        username: sftp.username.trim(),
        password: sftp.password.trim(),
        remotePath: sftp.remotePath.trim()
      });
      
      if (res.data?.success) {
        toast.update(toastId, { 
          render: 'SFTP connection successful!', 
          type: 'success', 
          isLoading: false, 
          autoClose: 5000 
        });
      } else {
        toast.update(toastId, { 
          render: res.data?.message || 'SFTP connection failed', 
          type: 'error', 
          isLoading: false, 
          autoClose: 5000 
        });
      }
    } catch (err) {
      toast.update(toastId, { 
        render: err.response?.data?.message || 'Failed to test SFTP connection', 
        type: 'error', 
        isLoading: false, 
        autoClose: 5000 
      });
    } finally {
      setTesting(false);
    }
  };

  const handleFetchNow = async () => {
    toast.info('Starting SFTP sync... This may take 30-60 seconds.', { autoClose: 3000 });

    try {
      const result = await triggerFetch();

      if (result.success) {
        try {
          await refetchMetrics();
          await refetchSyncLogs();
        } catch (e) {
          console.warn('Failed to refetch dropCowboy data', e);
        }

        if (result.data?.warning) {
          toast.warning(result.data.warning, { autoClose: 5000 });
        } else if (result.data?.filesDownloaded > 0) {
          toast.success(`Successfully fetched ${result.data.filesDownloaded} files from SFTP!`, { autoClose: 5000 });
        } else {
          toast.info('Sync completed - using existing data.', { autoClose: 3000 });
        }
      } else {
        toast.error('Failed to fetch data: ' + (result.error || 'Unknown error'), { autoClose: 5000 });
      }
    } catch (err) {
      console.error('Error while triggering manual fetch', err);
      toast.error('Failed to start SFTP sync');
    }
  };

  if (!canAccessSetting('sftp')) return null;

  return (
    <SettingsSection id="sftp">
      <div className="card">
        <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
          <SettingsIcon className="mr-2" size={20} />
          Voicemail SFTP Credentials (DropCowboy)
        </h2>
        <p className="text-sm text-gray-600 mb-6">
          Configure SFTP connection for DropCowboy ringless voicemail data sync.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">SFTP Host</label>
            <input
              type="text"
              name="host"
              value={sftp.host}
              onChange={handleChange}
              className="input"
              placeholder="sftp.example.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Port</label>
            <input
              type="number"
              name="port"
              value={sftp.port}
              onChange={handleChange}
              className="input"
              placeholder="22"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
            <input
              type="text"
              name="username"
              value={sftp.username}
              onChange={handleChange}
              className="input"
              placeholder="sftp_user"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                name="password"
                value={sftp.password}
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
            <label className="block text-sm font-medium text-gray-700 mb-1">Remote Path</label>
            <input
              type="text"
              name="remotePath"
              value={sftp.remotePath}
              onChange={handleChange}
              className="input"
              placeholder="/reports"
            />
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            onClick={handleSave}
            className="btn btn-primary flex items-center"
            disabled={loading || isFetching}
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
          <button
            onClick={handleFetchNow}
            className="btn btn-secondary flex items-center"
            disabled={isFetching || loading}
          >
            <RefreshCw size={16} className={`mr-2 ${isFetching ? 'animate-spin' : ''}`} />
            {isFetching ? 'Syncing...' : 'Fetch Now'}
          </button>
        </div>
      </div>
    </SettingsSection>
  );
};

export default SftpCredentials;
