import { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { Settings as SettingsIcon, Save, RefreshCw } from 'lucide-react';
import SettingsSection from './SettingsSection';
import { useSettings } from './SettingsLayout';

const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'];
const MAX_FAVICON_SIZE = 200 * 1024;
const MAX_LOGO_SIZE = 2 * 1024 * 1024;
const MAX_LOGIN_BG_SIZE = 5 * 1024 * 1024;

const formatBytes = (bytes) => {
  if (!bytes) return '0 B';
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${parseFloat((bytes / Math.pow(1024, i)).toFixed(2))} ${sizes[i]}`;
};

const SiteBranding = () => {
  const { canAccessSetting } = useSettings();
  
  const [siteTitle, setSiteTitle] = useState('');
  const [faviconFile, setFaviconFile] = useState(null);
  const [faviconPreview, setFaviconPreview] = useState(null);
  const [faviconPath, setFaviconPath] = useState(null);
  const [faviconUploading, setFaviconUploading] = useState(false);
  
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState(null);
  const [logoPath, setLogoPath] = useState(null);
  const [logoUploading, setLogoUploading] = useState(false);
  
  const [loginBgType, setLoginBgType] = useState('image');
  const [loginBgImageFile, setLoginBgImageFile] = useState(null);
  const [loginBgImagePreview, setLoginBgImagePreview] = useState(null);
  const [loginBgImagePath, setLoginBgImagePath] = useState(null);
  const [loginBgUploading, setLoginBgUploading] = useState(false);
  const [loginBgColor, setLoginBgColor] = useState('#ffffff');
  const [loginBgGradientFrom, setLoginBgGradientFrom] = useState('#000000');
  const [loginBgGradientTo, setLoginBgGradientTo] = useState('#ffffff');
  
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchSiteCustomization();
  }, []);

  useEffect(() => {
    return () => {
      try {
        if (faviconPreview && faviconPreview.startsWith('blob:')) URL.revokeObjectURL(faviconPreview);
        if (logoPreview && logoPreview.startsWith('blob:')) URL.revokeObjectURL(logoPreview);
        if (loginBgImagePreview && loginBgImagePreview.startsWith('blob:')) URL.revokeObjectURL(loginBgImagePreview);
      } catch (e) {}
    };
  }, [faviconPreview, logoPreview, loginBgImagePreview]);

  const fetchSiteCustomization = async () => {
    try {
      const res = await axios.get('/api/superadmin/site-customization');
      const data = res.data?.data;
      if (data) {
        setSiteTitle(data.siteTitle || '');
        if (data.faviconPath) setFaviconPreview(data.faviconPath);
        if (data.logoPath) setLogoPreview(data.logoPath);
        if (data.loginBgImagePath) setLoginBgImagePreview(data.loginBgImagePath);
        if (data.loginBgType) setLoginBgType(data.loginBgType);
        if (data.loginBgColor) setLoginBgColor(data.loginBgColor);
        if (data.loginBgGradientFrom) setLoginBgGradientFrom(data.loginBgGradientFrom);
        if (data.loginBgGradientTo) setLoginBgGradientTo(data.loginBgGradientTo);
      }
    } catch (err) {
      console.warn('Failed to fetch site customization', err);
    }
  };

  const validateAndPreview = (file, maxSize, setFile, setPreview) => {
    if (!file) return false;
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      toast.error('Invalid file type. Please use PNG, JPG, SVG, or WEBP.');
      return false;
    }
    if (file.size > maxSize) {
      toast.error(`File too large. Maximum size is ${formatBytes(maxSize)}.`);
      return false;
    }
    setFile(file);
    setPreview(URL.createObjectURL(file));
    return true;
  };

  const handleFaviconChange = (e) => {
    const file = e.target.files?.[0];
    if (file) validateAndPreview(file, MAX_FAVICON_SIZE, setFaviconFile, setFaviconPreview);
  };

  const handleLogoChange = (e) => {
    const file = e.target.files?.[0];
    if (file) validateAndPreview(file, MAX_LOGO_SIZE, setLogoFile, setLogoPreview);
  };

  const handleLoginBgChange = (e) => {
    const file = e.target.files?.[0];
    if (file) validateAndPreview(file, MAX_LOGIN_BG_SIZE, setLoginBgImageFile, setLoginBgImagePreview);
  };

  const uploadFile = async (file, type, setPath, setUploading) => {
    if (!file) return null;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file, file.name);
      form.append('type', type);
      const ext = file.name.includes('.') ? file.name.substring(file.name.lastIndexOf('.')) : '';
      let targetName = `${type}${ext}`;
      form.append('targetName', targetName);
      form.append('overwrite', 'true');

      const res = await axios.post('/api/superadmin/site-config/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      if (res.data?.success) {
        setPath(res.data.data.path);
        return res.data.data.path;
      }
      throw new Error(res.data?.message || 'Upload failed');
    } catch (err) {
      toast.error(err.message || 'Upload failed');
      return null;
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      let newFaviconPath = faviconPath;
      let newLogoPath = logoPath;
      let newLoginBgPath = loginBgImagePath;

      if (faviconFile) {
        newFaviconPath = await uploadFile(faviconFile, 'favicon', setFaviconPath, setFaviconUploading);
      }
      if (logoFile) {
        newLogoPath = await uploadFile(logoFile, 'logo', setLogoPath, setLogoUploading);
      }
      if (loginBgImageFile) {
        newLoginBgPath = await uploadFile(loginBgImageFile, 'loginBg', setLoginBgImagePath, setLoginBgUploading);
      }

      const payload = {
        siteTitle: siteTitle || '',
        faviconPath: newFaviconPath || (faviconPreview && typeof faviconPreview === 'string' && !faviconPreview.startsWith('blob:') ? faviconPreview : undefined),
        logoPath: newLogoPath || (logoPreview && typeof logoPreview === 'string' && !logoPreview.startsWith('blob:') ? logoPreview : undefined),
        loginBgType: loginBgType || 'image',
        loginBgImagePath: newLoginBgPath || (loginBgImagePreview && typeof loginBgImagePreview === 'string' && !loginBgImagePreview.startsWith('blob:') ? loginBgImagePreview : undefined),
        loginBgColor: loginBgColor || undefined,
        loginBgGradientFrom: loginBgGradientFrom || undefined,
        loginBgGradientTo: loginBgGradientTo || undefined
      };

      Object.keys(payload).forEach(k => payload[k] === undefined && delete payload[k]);

      const res = await axios.put('/api/superadmin/site-config', payload);

      if (res.data?.success) {
        const data = res.data.data || {};
        toast.success('Site customization saved');
        if (data.faviconPath) setFaviconPreview(data.faviconPath);
        if (data.logoPath) setLogoPreview(data.logoPath);
        if (data.loginBgImagePath) setLoginBgImagePreview(data.loginBgImagePath);

        setFaviconFile(null);
        setLogoFile(null);
        setLoginBgImageFile(null);

        try {
          const saved = {
            siteTitle: payload.siteTitle || data.siteTitle || '',
            faviconPath: data.faviconPath || payload.faviconPath || null,
            logoPath: data.logoPath || payload.logoPath || null,
            loginBgType: payload.loginBgType || data.loginBgType || loginBgType,
            loginBgImagePath: data.loginBgImagePath || payload.loginBgImagePath || null,
            loginBgColor: payload.loginBgColor || data.loginBgColor || loginBgColor,
            loginBgGradientFrom: payload.loginBgGradientFrom || data.loginBgGradientFrom || loginBgGradientFrom,
            loginBgGradientTo: payload.loginBgGradientTo || data.loginBgGradientTo || loginBgGradientTo
          };
          localStorage.setItem('siteCustomization', JSON.stringify(saved));

          if (saved.siteTitle) document.title = saved.siteTitle;
          if (saved.faviconPath) {
            let link = document.querySelector("link[rel*='icon']");
            if (!link) {
              link = document.createElement('link');
              link.rel = 'icon';
              document.head.appendChild(link);
            }
            link.href = saved.faviconPath;
          }

          window.dispatchEvent(new CustomEvent('site-customization-updated', { detail: saved }));
        } catch (e) {}
      } else {
        toast.error(res.data?.message || 'Failed to save customization');
      }
    } catch (err) {
      console.error('Error saving site customization', err);
      toast.error(err.response?.data?.message || 'Failed to save customization');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    if (!window.confirm('Reset site customization to defaults? This will remove all branding.')) return;

    setLoading(true);
    try {
      await axios.put('/api/superadmin/site-config', {
        siteTitle: '',
        faviconPath: null,
        logoPath: null,
        loginBgType: 'image',
        loginBgImagePath: null,
        loginBgColor: null,
        loginBgGradientFrom: null,
        loginBgGradientTo: null
      });

      setSiteTitle('');
      setFaviconFile(null);
      setFaviconPreview(null);
      setFaviconPath(null);
      setLogoFile(null);
      setLogoPreview(null);
      setLogoPath(null);
      setLoginBgType('image');
      setLoginBgImageFile(null);
      setLoginBgImagePreview(null);
      setLoginBgImagePath(null);
      setLoginBgColor('#ffffff');
      setLoginBgGradientFrom('#000000');
      setLoginBgGradientTo('#ffffff');

      localStorage.removeItem('siteCustomization');
      document.title = 'Reporting Dashboard';
      const link = document.querySelector("link[rel*='icon']");
      if (link) link.href = '/favicon.png';
      document.documentElement.style.removeProperty('--site-login-bg');

      toast.success('Site customization cleared');
    } catch (err) {
      console.error('Failed to reset site customization', err);
      toast.error(err.response?.data?.message || 'Failed to reset site customization');
    } finally {
      setLoading(false);
    }
  };

  if (!canAccessSetting('sitecustom')) return null;

  return (
    <SettingsSection id="sitecustom" className="mb-16">
      <div className="card">
        <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
          <SettingsIcon className="mr-2" size={20} />
          Site Customization
        </h2>

        <div className="mb-4 text-sm text-gray-600">
          Configure site title, favicon, logo and login background styling.
        </div>

        <div className="grid grid-cols-1 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Site Title</label>
            <input
              type="text"
              value={siteTitle}
              onChange={(e) => setSiteTitle(e.target.value)}
              className="input"
              placeholder="My Dashboard"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Favicon</label>
              <input type="file" accept="image/*" onChange={handleFaviconChange} className="input-file" />
              <div className="text-xs text-gray-500 mt-1">Max: {formatBytes(MAX_FAVICON_SIZE)}</div>
              {faviconPreview && (
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-sm text-gray-600">Preview:</span>
                  <img src={faviconPreview} alt="favicon" className="h-8 w-8 object-contain border rounded" />
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Logo</label>
              <input type="file" accept="image/*" onChange={handleLogoChange} className="input-file" />
              <div className="text-xs text-gray-500 mt-1">Max: {formatBytes(MAX_LOGO_SIZE)}</div>
              {logoPreview && (
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-sm text-gray-600">Preview:</span>
                  <img src={logoPreview} alt="logo" className="h-12 max-w-[150px] object-contain border rounded" />
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Login Background</label>
            <div className="flex gap-4 mb-3">
              {['image', 'color', 'gradient'].map((type) => (
                <label key={type} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="loginBgType"
                    value={type}
                    checked={loginBgType === type}
                    onChange={(e) => setLoginBgType(e.target.value)}
                  />
                  <span className="text-sm capitalize">{type}</span>
                </label>
              ))}
            </div>

            {loginBgType === 'image' && (
              <div>
                <input type="file" accept="image/*" onChange={handleLoginBgChange} className="input-file" />
                <div className="text-xs text-gray-500 mt-1">Max: {formatBytes(MAX_LOGIN_BG_SIZE)}</div>
                {loginBgImagePreview && (
                  <div className="mt-2">
                    <img src={loginBgImagePreview} alt="login bg" className="h-24 object-cover border rounded" />
                  </div>
                )}
              </div>
            )}

            {loginBgType === 'color' && (
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={loginBgColor}
                  onChange={(e) => setLoginBgColor(e.target.value)}
                  className="h-10 w-20"
                />
                <input
                  type="text"
                  value={loginBgColor}
                  onChange={(e) => setLoginBgColor(e.target.value)}
                  className="input w-32"
                />
              </div>
            )}

            {loginBgType === 'gradient' && (
              <div className="flex items-center gap-3">
                <div>
                  <label className="text-xs text-gray-500">From</label>
                  <input
                    type="color"
                    value={loginBgGradientFrom}
                    onChange={(e) => setLoginBgGradientFrom(e.target.value)}
                    className="h-10 w-16"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500">To</label>
                  <input
                    type="color"
                    value={loginBgGradientTo}
                    onChange={(e) => setLoginBgGradientTo(e.target.value)}
                    className="h-10 w-16"
                  />
                </div>
                <div
                  className="h-10 w-32 rounded border"
                  style={{ background: `linear-gradient(90deg, ${loginBgGradientFrom}, ${loginBgGradientTo})` }}
                />
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <button
            onClick={handleSave}
            className="btn btn-primary flex items-center"
            disabled={loading || faviconUploading || logoUploading || loginBgUploading}
          >
            <Save size={16} className="mr-2" />
            {loading ? 'Saving...' : 'Save Customization'}
          </button>
          <button
            onClick={handleReset}
            className="btn btn-secondary flex items-center"
            disabled={loading}
          >
            <RefreshCw size={16} className="mr-2" />
            Reset to Defaults
          </button>
        </div>
      </div>
    </SettingsSection>
  );
};

export default SiteBranding;
