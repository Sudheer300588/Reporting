import { useState, useEffect, useRef } from 'react';

import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import { toast } from 'react-toastify';
import {
    Settings as SettingsIcon,
    Save,
    RefreshCw,
    Shield,
    CheckCircle
} from 'lucide-react';
import packageJson from '../../../backend/package.json';
import { useManualFetch, useMetrics, useSyncLogs } from '../hooks/dropCowboy';
import ClientsTable from '../components/mautic/ClientsTable';
import AddClientModal from '../components/mautic/AddClientModal';
import { useClients, useSync } from '../hooks/mautic';
import {
    ACTIONS,
    getActionLabel,
    getActionByKey,
    getVariablesForAction,
    getDefaultTemplate
} from '../constants/notificationActions';
import RolesAndPermissions from '../components/Settings/RolesAndPermissions';

// v2.0 - System Maintenance Email Feature

const defaultSettings = {
    systemSettings: {
        allowSelfRegistration: false,
        requireManagerApproval: true,
        maxProjectsPerManager: 10,
        maxTasksPerUser: 20,
        sessionTimeoutMinutes: 480
    },
    notifications: {
        emailNotifications: true,
        taskDeadlineReminder: true,
        deadlineReminderDays: 2,
        reminderTime: '09:00',
        projectStatusUpdates: true,
        statusChangeNotification: true,
        newProjectAssignment: true,
        weeklyReports: true,
        weeklyReportDay: 'friday',
        weeklyReportTime: '09:00',
        overdueTasks: true,
        teamUpdates: true,
        systemUpdates: true
    }
};

const smtpDefault = {
    host: '',
    port: 587,
    username: '',
    password: '',
    fromAddress: ''
};

const sftpDefault = {
    host: '',
    port: 22,
    username: '',
    password: '',
    remotePath: '/reports'
};

const vicidialDefault = {
    url: '',
    username: '',
    password: ''
};

// Upload constraints and helpers
const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'];
const MAX_FAVICON_SIZE = 200 * 1024; // 200 KB
const MAX_LOGO_SIZE = 2 * 1024 * 1024; // 2 MB
const MAX_LOGIN_BG_SIZE = 5 * 1024 * 1024; // 5 MB

const formatBytes = (bytes) => {
    if (!bytes) return '0 B';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${parseFloat((bytes / Math.pow(1024, i)).toFixed(2))} ${sizes[i]}`;
};

// Template variables for email notifications
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

// Sample data map for template preview
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

console.log('SAMPLE_MAP loaded:', Object.keys(SAMPLE_MAP).length, 'variables');

const Settings = () => {
     const { user } = useAuth();
        const isInteractingRef = useRef(false);

    const [activeSection, setActiveSection] = useState('mautic');

    const contentRef = useRef(null);
       const sectionRefs = {
        mautic: useRef(null),
        smtp: useRef(null),
        sftp: useRef(null),
        vicidial: useRef(null),
        sitecustom: useRef(null),
        notifs: useRef(null),
        maintenance: useRef(null),
        roles: useRef(null)
    };


    
   const scrollToSection = (key) => {
        setActiveSection(key);
        sectionRefs[key]?.current?.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
        });
    };
    // Auto-select section on scroll
 useEffect(() => {
        const handleScroll = () => {
            if (isInteractingRef.current) return;

            const sections = [
                'roles',
                'mautic',
                'notifs',
                'maintenance',
                'smtp',
                'sftp',
                'vicidial',
                'sitecustom'
            ];

            for (const key of sections) {
                const el = sectionRefs[key]?.current;
                if (!el) continue;

                const rect = el.getBoundingClientRect();
                if (rect.top <= 200 && rect.bottom > 100) {
                    setActiveSection(key);
                    break;
                }
            }
        };

        const scrollEl = contentRef.current;
        if (!scrollEl) return;

        scrollEl.addEventListener('scroll', handleScroll);
        window.addEventListener('scroll', handleScroll, true);

        return () => {
            scrollEl.removeEventListener('scroll', handleScroll);
            window.removeEventListener('scroll', handleScroll, true);
        };
    }, []);

   
    const [settings, setSettings] = useState(defaultSettings);
    const [sftp, setSftp] = useState(sftpDefault);
    const [sftpLoading, setSftpLoading] = useState(false);

    const [smtp, setSmtp] = useState(smtpDefault);
    const [smtpLoading, setSmtpLoading] = useState(false);

    const [vicidial, setVicidial] = useState(vicidialDefault);
    const [vicidialLoading, setVicidialLoading] = useState(false);

    // Notifications settings
    const [notifications, setNotifications] = useState([]);
    const [notifLoading, setNotifLoading] = useState(false);
    const [editingNotif, setEditingNotif] = useState(null);
    const [newNotif, setNewNotif] = useState({ action: '', template: '', active: true });
    const [emailEnabled, setEmailEnabled] = useState(true);
    const [emailEnableSaving, setEmailEnableSaving] = useState(false);
    const [activityEmailEnabled, setActivityEmailEnabled] = useState(true);
    const [activityEmailSaving, setActivityEmailSaving] = useState(false);
    
    // Email logs and stats
    const [emailLogs, setEmailLogs] = useState([]);
    const [emailStats, setEmailStats] = useState(null);
    const [showEmailLogs, setShowEmailLogs] = useState(false);
    const [emailLogsLoading, setEmailLogsLoading] = useState(false);

    // System Maintenance Email
    const [maintenanceTemplate, setMaintenanceTemplate] = useState({ subject: '', body: '' });
    const [sendingMaintenance, setSendingMaintenance] = useState(false);
    const [maintenanceResult, setMaintenanceResult] = useState(null);
    const [showPreviewModal, setShowPreviewModal] = useState(false);
    const [savedTemplates, setSavedTemplates] = useState([]);
    const [templateName, setTemplateName] = useState('');

    // Roles Management
    const [admins, setAdmins] = useState([]);
    const [selectedAdmin, setSelectedAdmin] = useState(null);
    const [adminPermissions, setAdminPermissions] = useState([]);
    const [adminsLoading, setAdminsLoading] = useState(false);
    const [savingPermissions, setSavingPermissions] = useState(false);
    
    // User's own settings permissions (for filtering)
    const [myPermissions, setMyPermissions] = useState([]);

    // ACTIONS and getActionLabel imported from shared constants

    const insertVarToNew = (varKey) => {
        setNewNotif(n => ({ ...n, template: (n.template || '') + ` {{${varKey}}}` }));
    };

    const insertVarToEdit = (id, varKey) => {
        setNotifications(prev => prev.map(x => x.id === id ? { ...x, template: (x.template || '') + ` {{${varKey}}}` } : x));
    };

    const renderTemplate = (template) => {
        if (!template) return '';
        return template.replace(/{{\s*([\w\.]+)\s*}}/g, (_, key) => {
            return SAMPLE_MAP[key] ?? `<<${key}>>`;
        });
    };

    const canAccessSetting = (settingKey) => {
        // Superadmin can access everything
        if (user?.role === 'superadmin') return true;
        
        // Admin can access only their permitted settings
        if (user?.role === 'admin') {
            return myPermissions.includes(settingKey);
        }
        
        // Other roles cannot access settings
        return false;
    };

    const [newPreviewOpen, setNewPreviewOpen] = useState(false);
    const [editingPreviewId, setEditingPreviewId] = useState(null);

    // Site customization (UI-only for now)
    const [siteTitle, setSiteTitle] = useState('');
    const [faviconFile, setFaviconFile] = useState(null);
    const [faviconPreview, setFaviconPreview] = useState(null);
    const [faviconPath, setFaviconPath] = useState(null);
    const [faviconUploading, setFaviconUploading] = useState(false);
    const [faviconProgress, setFaviconProgress] = useState(0);
    const [logoFile, setLogoFile] = useState(null);
    const [logoPreview, setLogoPreview] = useState(null);
    const [logoPath, setLogoPath] = useState(null);
    const [logoUploading, setLogoUploading] = useState(false);
    const [logoProgress, setLogoProgress] = useState(0);
    const [loginBgType, setLoginBgType] = useState('image'); // 'image' | 'color' | 'gradient'
    const [loginBgImageFile, setLoginBgImageFile] = useState(null);
    const [loginBgImagePreview, setLoginBgImagePreview] = useState(null);
    const [loginBgImagePath, setLoginBgImagePath] = useState(null);
    const [loginBgUploading, setLoginBgUploading] = useState(false);
    const [loginBgProgress, setLoginBgProgress] = useState(0);
    const [loginBgColor, setLoginBgColor] = useState('#ffffff');
    const [loginBgGradientFrom, setLoginBgGradientFrom] = useState('#000000');
    const [loginBgGradientTo, setLoginBgGradientTo] = useState('#ffffff');
    const [customLoading, setCustomLoading] = useState(false);

    // Mautic clients management
    const { clients, loading: mauticLoading, refetch: refetchClients } = useClients();
    const [isMauticModalOpen, setIsMauticModalOpen] = useState(false);
    const [editingMauticClient, setEditingMauticClient] = useState(null);

    const { syncAllClients, isSyncing } = useSync();

    // DropCowboy SFTP manual fetch hooks (metrics + sync logs refetchers)
    const { triggerFetch, isFetching } = useManualFetch();
    const { refetch: refetchMetrics } = useMetrics();
    const { refetch: refetchSyncLogs } = useSyncLogs();

    const handleSyncClients = async () => {
        // show a loading toast (with spinner) while sync runs
        const toastId = toast.loading('Starting Mautic sync...');
        try {
            const result = await syncAllClients();

            if (result.success) {
                const message = result.data?.results
                    ? `Sync completed: ${result.data.results.successful}/${result.data.results.totalClients} successful`
                    : result.message || 'Sync completed successfully';
                toast.update(toastId, { render: message, type: 'success', isLoading: false, autoClose: 5000 });
                // Dispatch a global event so other parts of the app (dashboard, sections) can refresh
                try {
                    window.dispatchEvent(new CustomEvent('mautic:sync-complete', { detail: result }));
                } catch (e) {
                    console.warn('Failed to dispatch sync event', e);
                }

                // Refresh clients and settings after sync
                await refetchClients();
                await fetchSettings();
            } else if (result.isSyncing) {
                toast.update(toastId, { render: result.message || 'Sync already in progress', type: 'info', isLoading: false, autoClose: 4000 });
            } else {
                toast.update(toastId, { render: result.error || 'Sync failed', type: 'error', isLoading: false, autoClose: 5000 });
            }
        } catch (err) {
            toast.update(toastId, { render: err?.message || 'Failed to start sync', type: 'error', isLoading: false, autoClose: 5000 });
        }
    };

    const fetchSmtpCred = async () => {
        setSmtpLoading(true);
        try {
            const res = await axios.get('/api/superadmin/smtp-credentials');
            if (res.data?.data) setSmtp({ ...smtp, ...res.data.data });
        } catch (err) {
            // ignore if not set
            console.error("error while fetching sftp creds", err)
        } finally {
            setSmtpLoading(false);
        }
    };

    const handleSmtpChange = (e) => {
        const { name, value } = e.target;
        setSmtp((prev) => ({ ...prev, [name]: value }));
    };

    const handleSmtpSave = async () => {
        setSmtpLoading(true);
        try {
            // Trim all fields before sending
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
            setSmtpLoading(false);
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

    const fetchVicidialCred = async () => {
        setVicidialLoading(true);
        try {
            const res = await axios.get('/api/superadmin/vicidial-credentials');
            if (res.data?.data) setVicidial({ ...vicidial, ...res.data.data });
        } catch (err) {
            // ignore if not set
            console.error("error while fetching vicidial creds", err)
        } finally {
            setVicidialLoading(false);
        }
    };

    const handleVicidialChange = (e) => {
        const { name, value } = e.target;
        setVicidial((prev) => ({ ...prev, [name]: value }));
    };

    const handleVicidialSave = async () => {
        setVicidialLoading(true);
        try {
            // Trim all fields before sending
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
            setVicidialLoading(false);
        }
    };

    const fetchMyPermissions = async () => {
        try {
            const res = await axios.get('/api/settings/my-permissions');
            if (res.data.success) {
                setMyPermissions(res.data.permissions || []);
            }
        } catch (error) {
            console.error('Failed to fetch permissions', error);
        }
    };

    const fetchAdmins = async () => {
        setAdminsLoading(true);
        try {
            const res = await axios.get('/api/settings/admin-permissions');
            if (res.data.success) {
                setAdmins(res.data.admins || []);
            }
        } catch (error) {
            console.error('Failed to fetch admins', error);
            toast.error('Failed to load admin list');
        } finally {
            setAdminsLoading(false);
        }
    };

    const handleAdminSelect = (admin) => {
        setSelectedAdmin(admin);
        setAdminPermissions(admin.permissions || []);
    };

    const handlePermissionToggle = (setting) => {
        setAdminPermissions(prev => {
            if (prev.includes(setting)) {
                return prev.filter(p => p !== setting);
            } else {
                return [...prev, setting];
            }
        });
    };

    const handleSaveAdminPermissions = async () => {
        if (!selectedAdmin) return;
        
        setSavingPermissions(true);
        try {
            await axios.put(`/api/settings/admin-permissions/${selectedAdmin.id}`, {
                permissions: adminPermissions
            });
            toast.success('Roles updated successfully');
            
            // Refresh admin list
            await fetchAdmins();
            
            // Update selected admin with new permissions
            const updatedAdmin = admins.find(a => a.id === selectedAdmin.id);
            if (updatedAdmin) {
                setSelectedAdmin({ ...updatedAdmin, permissions: adminPermissions });
            }
        } catch (error) {
            console.error('Failed to save Roles', error);
            toast.error(error.response?.data?.message || 'Failed to save permissions');
        } finally {
            setSavingPermissions(false);
        }
    };

    useEffect(() => {
        fetchMyPermissions();
        fetchSettings();
        fetchSftpCred();
        fetchSmtpCred();
        fetchVicidialCred();
        fetchSiteCustomization();
        fetchNotifications();
        
        // Fetch admins list if user is superadmin
        if (user?.role === 'superadmin') {
            fetchAdmins();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

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
            // ignore
            console.warn('Failed to fetch site customization', err);
        }
    };


    const fetchSettings = async () => {
        try {
            console.log('📊 Fetching settings...');
            const response = await axios.get('/api/settings');
            const fetchedSettings = response.data.settings || settings;
            console.log('📊 Fetched settings:', fetchedSettings);
            console.log('🔔 notifActivityEmails value:', fetchedSettings.notifActivityEmails);
            setSettings(fetchedSettings);
            setEmailEnabled(fetchedSettings.notifEmailNotifications !== false);
            setActivityEmailEnabled(fetchedSettings.notifActivityEmails !== false);
            console.log('✅ Activity email enabled state set to:', fetchedSettings.notifActivityEmails !== false);
        } catch (error) {
            console.error('❌ Error fetching settings:', error);
        }
    };

    const fetchNotifications = async () => {
        setNotifLoading(true);
        try {
            // endpoint follows superadmin pattern; backend may expose a different route
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
            const res = await axios.put('/api/settings', {
                notifEmailNotifications: enabled
            });
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
        console.log('🔔 handleToggleActivityEmails called with:', enabled);
        setActivityEmailSaving(true);
        try {
            console.log('📤 Sending request to /api/settings with notifActivityEmails:', enabled);
            const res = await axios.put('/api/settings', {
                notifActivityEmails: enabled
            });
            console.log('📥 Response received:', res.data);
            if (res.data?.success) {
                setActivityEmailEnabled(enabled);
                toast.success(`Activity email notifications ${enabled ? 'enabled' : 'disabled'}`);
                await fetchSettings();
            } else {
                toast.error(res.data?.message || 'Failed to update settings');
            }
        } catch (err) {
            console.error('❌ Toggle activity emails failed', err);
            console.error('Error response:', err.response?.data);
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
                // Refresh logs
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
                
                // Refresh email logs if visible
                if (showEmailLogs) {
                    await fetchEmailLogs();
                    await fetchEmailStats();
                }
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

    // --- Local template save/load helpers (simple localStorage)
    const loadSavedTemplates = () => {
        try {
            const raw = localStorage.getItem('maintenance_templates');
            if (raw) setSavedTemplates(JSON.parse(raw));
        } catch (e) {
            console.warn('Failed to load saved templates', e);
        }
    };

    useEffect(() => {
        loadSavedTemplates();
    }, []);

    const saveTemplateLocally = () => {
        if (!templateName?.trim()) return toast.error('Please provide a name to save the template');
        const list = Array.isArray(savedTemplates) ? [...savedTemplates] : [];
        list.unshift({ name: templateName.trim(), subject: maintenanceTemplate.subject, body: maintenanceTemplate.body, createdAt: Date.now() });
        // keep up to 10
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

    const fetchSftpCred = async () => {
        setSftpLoading(true);
        try {
            const res = await axios.get('/api/superadmin/sftp-credentials');
            if (res.data?.data) setSftp({ ...sftp, ...res.data.data });
        } catch (err) {
            // ignore if not set
            console.error("error while fetching sftp creds", err)
        } finally {
            setSftpLoading(false);
        }
    };

    // Site customization handlers (UI-only)
    const handleFaviconChange = (e) => {
        const file = e.target.files?.[0] || null;
        if (!file) return;

        if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
            toast.error('Invalid file type. Allowed: PNG, JPG, SVG, WEBP');
            return;
        }

        if (file.size > MAX_FAVICON_SIZE) {
            toast.error(`Favicon too large. Max ${formatBytes(MAX_FAVICON_SIZE)}.`);
            return;
        }

        // check image dimensions (favicons should be small)
        const img = new Image();
        img.onload = async () => {
            if (img.naturalWidth > 256 || img.naturalHeight > 256) {
                toast.error('Favicon dimensions too large; prefer <= 256x256');
                return;
            }

            setFaviconFile(file);
            setFaviconPreview(URL.createObjectURL(file));
            try {
                const path = await uploadFile(file, 'favicon', setFaviconUploading, setFaviconProgress);
                setFaviconPath(path);
                setFaviconPreview(path);
                toast.success('Favicon uploaded');
            } catch (err) {
                console.error('Favicon upload failed', err);
                toast.error(err?.response?.data?.message || err.message || 'Favicon upload failed');
            }
        };
        img.onerror = () => {
            toast.error('Failed to read image file');
        };
        img.src = URL.createObjectURL(file);
    };

    const handleLogoChange = (e) => {
        const file = e.target.files?.[0] || null;
        if (!file) return;

        if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
            toast.error('Invalid file type. Allowed: PNG, JPG, SVG, WEBP');
            return;
        }

        if (file.size > MAX_LOGO_SIZE) {
            toast.error(`Logo too large. Max ${formatBytes(MAX_LOGO_SIZE)}.`);
            return;
        }

        setLogoFile(file);
        setLogoPreview(URL.createObjectURL(file));
        uploadFile(file, 'logo', setLogoUploading, setLogoProgress)
            .then((path) => {
                setLogoPath(path);
                setLogoPreview(path);
                toast.success('Logo Uploaded');
            })
            .catch((err) => {
                console.error('Logo upload failed', err);
                toast.error(err?.response?.data?.message || err.message || 'Logo Upload Failed');
            });
    };

    const handleLoginBgImageChange = (e) => {
        const file = e.target.files?.[0] || null;
        if (!file) return;

        if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
            toast.error('Invalid file type. Allowed: PNG, JPG, SVG, WEBP');
            return;
        }

        if (file.size > MAX_LOGIN_BG_SIZE) {
            toast.error(`Background image too large. Max ${formatBytes(MAX_LOGIN_BG_SIZE)}.`);
            return;
        }

        setLoginBgImageFile(file);
        setLoginBgImagePreview(URL.createObjectURL(file));
        uploadFile(file, 'loginBg', setLoginBgUploading, setLoginBgProgress)
            .then((path) => {
                setLoginBgImagePath(path);
                setLoginBgImagePreview(path);
                toast.success('Login Page Background Image Uploaded');
            })
            .catch((err) => {
                console.error('Login BG upload failed', err);
                toast.error(err?.response?.data?.message || err.message || 'Login Page Background Image Upload Failed');
            });
    };

    const uploadFile = async (file, type, setUploading, setProgress) => {
        setUploading(true);
        setProgress(0);
        try {
            const form = new FormData();
            form.append('file', file, file.name);
            form.append('type', type);
            // send deterministic filename to overwrite previous file with same name
            const ext = (file.name && file.name.includes('.')) ? file.name.substring(file.name.lastIndexOf('.')) : '';
            let targetName = `${type}${ext}`;
            if (type === 'logo') targetName = `logo${ext}`;
            if (type === 'loginBg') targetName = `login-bg${ext}`;
            if (type === 'favicon') targetName = `favicon${ext}`;
            form.append('targetName', targetName);
            form.append('overwrite', 'true');

            const res = await axios.post('/api/superadmin/site-config/upload', form, {
                headers: { 'Content-Type': 'multipart/form-data' },
                onUploadProgress: (progressEvent) => {
                    if (progressEvent.total) {
                        const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                        setProgress(percent);
                    }
                }
            });
            if (res.data?.success) return res.data.data.path;
            // Surface server-side message where available
            throw new Error(res.data?.message || 'Upload failed');
        } finally {
            setUploading(false);
        }
    };

    useEffect(() => {
        return () => {
            // revoke any created object URLs on unmount
            try {
                if (faviconPreview) URL.revokeObjectURL(faviconPreview);
                if (logoPreview) URL.revokeObjectURL(logoPreview);
                if (loginBgImagePreview) URL.revokeObjectURL(loginBgImagePreview);
            } catch (e) {
                // ignore
            }
        };
    }, [faviconPreview, logoPreview, loginBgImagePreview]);

    const handleSaveCustomization = async () => {
        setCustomLoading(true);
        try {
            // build payload using uploaded paths (if available) otherwise keep existing previews
            const payload = {
                siteTitle: siteTitle || '',
                faviconPath: faviconPath || (faviconPreview && typeof faviconPreview === 'string' ? faviconPreview : undefined),
                logoPath: logoPath || (logoPreview && typeof logoPreview === 'string' ? logoPreview : undefined),
                loginBgType: loginBgType || 'image',
                loginBgImagePath: loginBgImagePath || (loginBgImagePreview && typeof loginBgImagePreview === 'string' ? loginBgImagePreview : undefined),
                loginBgColor: loginBgColor || undefined,
                loginBgGradientFrom: loginBgGradientFrom || undefined,
                loginBgGradientTo: loginBgGradientTo || undefined
            };

            // remove undefined keys
            Object.keys(payload).forEach(k => payload[k] === undefined && delete payload[k]);

            const res = await axios.put('/api/superadmin/site-config', payload);

            if (res.data?.success) {
                const data = res.data.data || {};
                toast.success('Site customization saved');
                if (data.faviconPath) setFaviconPreview(data.faviconPath);
                if (data.logoPath) setLogoPreview(data.logoPath);
                if (data.loginBgImagePath) setLoginBgImagePreview(data.loginBgImagePath);

                // persist customization to localStorage so it survives page reloads
                try {
                    const saved = {
                        siteTitle: payload.siteTitle || data.siteTitle || '',
                        faviconPath: data.faviconPath || payload.faviconPath || faviconPreview || null,
                        logoPath: data.logoPath || payload.logoPath || logoPreview || null,
                        loginBgType: payload.loginBgType || data.loginBgType || loginBgType,
                        loginBgImagePath: data.loginBgImagePath || payload.loginBgImagePath || loginBgImagePreview || null,
                        loginBgColor: payload.loginBgColor || data.loginBgColor || loginBgColor,
                        loginBgGradientFrom: payload.loginBgGradientFrom || data.loginBgGradientFrom || loginBgGradientFrom,
                        loginBgGradientTo: payload.loginBgGradientTo || data.loginBgGradientTo || loginBgGradientTo
                    };
                    localStorage.setItem('siteCustomization', JSON.stringify(saved));

                    // update current document (favicon, title, login background) immediately
                    if (saved.siteTitle) {
                        document.title = saved.siteTitle;
                    }
                    if (saved.faviconPath) {
                        let link = document.querySelector("link[rel*='icon']");
                        if (!link) {
                            link = document.createElement('link');
                            link.rel = 'icon';
                            document.head.appendChild(link);
                        }
                        link.href = saved.faviconPath;
                    }

                    if (saved.loginBgType) {
                        if (saved.loginBgType === 'image' && saved.loginBgImagePath) {
                            document.documentElement.style.setProperty('--site-login-bg', `url('${saved.loginBgImagePath}')`);
                        } else if (saved.loginBgType === 'color' && saved.loginBgColor) {
                            document.documentElement.style.setProperty('--site-login-bg', saved.loginBgColor);
                        } else if (saved.loginBgType === 'gradient' && saved.loginBgGradientFrom && saved.loginBgGradientTo) {
                            document.documentElement.style.setProperty('--site-login-bg', `linear-gradient(90deg, ${saved.loginBgGradientFrom}, ${saved.loginBgGradientTo})`);
                        }
                    }

                    // notify other parts of the app to update immediately (Navbar, App, etc.)
                    try {
                        window.dispatchEvent(new CustomEvent('site-customization-updated', { detail: saved }));
                    } catch (e) {
                        // ignore
                    }
                } catch (e) {
                    // ignore localStorage errors
                }
            } else {
                toast.error(res.data?.message || 'Failed to save customization');
            }
        } catch (err) {
            console.error('Error saving site customization', err);
            toast.error(err.response?.data?.message || 'Failed to save customization');
        } finally {
            setCustomLoading(false);
        }
    };

    const handleResetCustomization = async () => {
        if (!window.confirm('Reset site customization to defaults? This will remove all branding from the app.')) return;

        setCustomLoading(true);
        try {
            // Send explicit nulls so backend clears stored paths
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

            // Clear local UI state
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

            // Remove persisted customization and reset document to defaults from index.html
            try {
                localStorage.removeItem('siteCustomization');
            } catch (e) {
                // ignore
            }

            // reset document title and favicon to defaults found in index.html
            try {
                document.title = 'Reporting Dashboard';
                const link = document.querySelector("link[rel*='icon']");
                if (link) {
                    link.href = '/favicon.png';
                }
                // clear custom login background var
                document.documentElement.style.removeProperty('--site-login-bg');
            } catch (e) {
                // ignore
            }

            toast.success('Site customization cleared');
        } catch (err) {
            console.error('Failed to reset site customization', err);
            toast.error(err.response?.data?.message || 'Failed to reset site customization');
        } finally {
            setCustomLoading(false);
        }
    };

    const handleSftpChange = (e) => {
        const { name, value } = e.target;
        setSftp((prev) => ({ ...prev, [name]: value }));
    };

    const handleSftpSave = async () => {
        setSftpLoading(true);
        try {
            // Trim all fields before sending
            const trimmed = {
                host: sftp.host.trim(),
                port: sftp.port,
                username: sftp.username.trim(),
                password: sftp.password.trim(),
                remotePath: sftp.remotePath.trim()
            };
            await axios.post('/api/superadmin/sftp-credentials', trimmed);
            toast.success('SFTP credentials saved');
            // After successfully saving SFTP credentials, start an automatic fetch
            try {
                toast.info('Starting SFTP sync... This may take 30-60 seconds.', { autoClose: 3000 });
                const result = await triggerFetch();

                if (result.success) {
                    // Reload dropCowboy-related data after successful fetch
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
                console.error('Error triggering fetch after saving SFTP creds', err);
                toast.error('Failed to start SFTP sync');
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to save SFTP credentials');
        } finally {
            setSftpLoading(false);
        }
    };

    const handleFetchNow = async () => {
        toast.info('Starting SFTP sync... This may take 30-60 seconds.', { autoClose: 3000 });

        try {
            const result = await triggerFetch();

            if (result.success) {
                // Reload data after successful fetch
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

   if (user?.role !== 'superadmin' && user?.role !== 'admin') {
        return (
            <div className="max-w-7xl mx-auto px-4 py-12 text-center">
                <Shield className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                    Access Restricted
                </h3>
                <p className="text-gray-500">
                    System settings are only available to Administrators.
                </p>
            </div>
        );
    }

    return (
       <div className="flex max-w-7xl mx-auto px-4 py-8">
            {/* LEFT SIDEBAR - Professional Navigation */}
            <nav className="hidden md:block w-72 pr-8 border-r border-gray-200 sticky top-8 h-[calc(100vh-4rem)] overflow-y-auto">
                <div className="mb-8">
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">Settings</h2>
                    <p className="text-sm text-gray-500">Manage system configuration</p>
                </div>
                <ul className="space-y-1 text-sm">
                    {[
                        { key: 'roles', label: 'Roles', icon: SettingsIcon, superadminOnly: true },
                        { key: 'mautic', label: 'Autovation Clients', icon: SettingsIcon },
                        { key: 'notifs', label: 'Notifications', icon: SettingsIcon },
                        { key: 'maintenance', label: 'System Maintenance Email', icon: SettingsIcon },
                        { key: 'smtp', label: 'SMTP Credentials', icon: SettingsIcon },
                        { key: 'sftp', label: 'Voicemail SFTP Credentials', icon: SettingsIcon },
                        { key: 'vicidial', label: 'Vicidial Credentials', icon: SettingsIcon },
                        { key: 'sitecustom', label: 'Site Customization', icon: SettingsIcon },
                    ].filter(({ key, superadminOnly }) => {
                        // Show Roles only to superadmin
                        if (superadminOnly && user?.role !== 'superadmin') return false;
                        
                        // For superadmin, show all settings
                        if (user?.role === 'superadmin') return true;
                        
                        // For admin, show only permitted settings
                        if (user?.role === 'admin') {
                            return myPermissions.includes(key);
                        }
                        
                        // For other roles, hide settings
                        return false;
                    }).map(({ key, label, icon: Icon }) => (
                        <li key={key}>
                            <button
                                onClick={() => scrollToSection(key)}
                                className={`flex items-center gap-3 w-full text-left px-4 py-3 rounded-lg transition-all duration-200 
                  ${activeSection === key 
                    ? 'bg-gradient-to-r from-blue-50 to-blue-100 text-blue-700 font-medium shadow-sm border border-blue-200' 
                    : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900 border border-transparent'
                  }
                `}
                            >
                                <Icon size={18} className={activeSection === key ? 'text-blue-600' : 'text-gray-400'} />
                                <span className="flex-1">{label}</span>
                                {activeSection === key && (
                                    <div className="w-1.5 h-1.5 rounded-full bg-blue-600"></div>
                                )}
                            </button>
                        </li>
                    ))}
                </ul>
            </nav>

            {/* RIGHT CONTENT AREA */}
           <div
                ref={contentRef}
                className="flex-1 ml-0 md:ml-8 pb-10 overflow-y-auto max-h-screen"
            >
                {/* PAGE HEADER - Cleaner & More Professional */}
                <div className="mb-10">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="p-2 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg shadow-md">
                            <SettingsIcon className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-bold text-gray-900">System Settings</h1>
                            <p className="text-sm text-gray-500 mt-0.5">Configure and manage your system preferences</p>
                        </div>
                    </div>

                    {/* Email Setup Success Banner */}
                    <div className="mt-6 p-4 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl shadow-sm">
                        <div className="flex items-start gap-3">
                            <div className="p-2 bg-green-100 rounded-lg">
                                <CheckCircle className="h-5 w-5 text-green-600" />
                            </div>
                            <div className="flex-1">
                                <h3 className="text-sm font-semibold text-green-900 mb-1">Email Notifications Ready</h3>
                                <p className="text-sm text-green-700 mb-2">Your email system is configured and ready to use.</p>
                                <ul className="space-y-1.5 text-sm text-green-700">
                                    <li className="flex items-center gap-2">
                                        <span className="w-1.5 h-1.5 rounded-full bg-green-600"></span>
                                        Enable notifications in the <span className="font-medium">Notifications</span> section
                                    </li>
                                    <li className="flex items-center gap-2">
                                        <span className="w-1.5 h-1.5 rounded-full bg-green-600"></span>
                                        Customize reminder times and preferences
                                    </li>
                                    <li className="flex items-center gap-2">
                                        <span className="w-1.5 h-1.5 rounded-full bg-green-600"></span>
                                        Update email in <a href="/profile" className="font-semibold underline hover:text-green-900">Profile</a>
                                    </li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Each scrollable section */}
                
                {/* Roles Section - Superadmin Only */}
                 {user?.role === 'superadmin' && (
                    <section
                        ref={sectionRefs.roles}
                        id="roles"
                        className="scroll-mt-20 mb-12"
                        onMouseDown={() => (isInteractingRef.current = true)}
                        onMouseUp={() => (isInteractingRef.current = false)}
                        onMouseLeave={() => (isInteractingRef.current = false)}
                    >
                        <RolesAndPermissions />
                    </section>
                )}

                {canAccessSetting('mautic') && (
                <section ref={sectionRefs.mautic} id="mautic" className="scroll-mt-20 mb-16">
                    <div className="card">
                        <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
                            <SettingsIcon className="mr-2" size={20} />
                            Autovation Clients
                        </h2>

                        <div className="mb-4 text-sm text-gray-600">
                            Manage Autovation (Mautic) clients used to sync data. You can add, edit or manage clients here.
                        </div>

                        <div className="mb-4 flex items-center justify-between">
                            <div />
                            <div className="flex gap-2">
                                <button
                                    onClick={() => { setEditingMauticClient(null); setIsMauticModalOpen(true); }}
                                    className="btn btn-primary"
                                >
                                    Add Client
                                </button>
                                <button
                                    onClick={handleSyncClients}
                                    className="btn btn-secondary flex items-center"
                                    disabled={isSyncing}
                                >
                                    {isSyncing ? (
                                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                                    ) : null}
                                    Sync
                                </button>
                            </div>
                        </div>

                        <div>
                            <ClientsTable
                                clients={clients}
                                onEdit={(c) => { setEditingMauticClient(c); setIsMauticModalOpen(true); }}
                                onRefresh={refetchClients}
                            />
                        </div>
                    </div>
                </section>
                )}

                {canAccessSetting('notifs') && (
                <section ref={sectionRefs.notifs} id="notifs" className="scroll-mt-20 mb-16">
                    <div className="card">
                        <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
                            <SettingsIcon className="mr-2" size={20} />
                            Notifications
                        </h2>

                        <div className="mb-4 text-sm text-gray-600">Create and manage notification templates. Use the template textarea to paste message templates.</div>

                        {/* Global Email Notifications Toggle */}
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

                        {/* Activity Email Notifications Toggle */}
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
                        
                        {/* Email Logs & Stats */}
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
                                    {/* Stats Cards */}
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
                                    
                                    {/* Recent Logs Table */}
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
                </section>
                )}

                {/* System Maintenance Email Section */}
                {canAccessSetting('maintenance') && (
                <section ref={sectionRefs.maintenance} id="maintenance" className="scroll-mt-20 mb-16">
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
                                    <div className={`px-3 py-1 rounded text-sm ${smtp.host && smtp.fromAddress ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                        {smtp.host && smtp.fromAddress ? 'SMTP configured' : 'SMTP not configured'}
                                    </div>

                                    <button 
                                        onClick={handleSendMaintenanceEmail}
                                        disabled={!maintenanceTemplate.subject?.trim() || !maintenanceTemplate.body?.trim() || sendingMaintenance || !smtp.host || !smtp.fromAddress}
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

                            {/* Preview Modal */}
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
                </section>
                )}

                {canAccessSetting('smtp') && (
                <section ref={sectionRefs.smtp} id="smtp" className="scroll-mt-20 mb-16">
                    <div className="card">
                        <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
                            <SettingsIcon className="mr-2" size={20} />
                            SMTP / Email Configuration
                        </h2>

                        {/* <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm">
                            <div className="font-medium text-blue-900 mb-2">📧 Amazon SES Configuration Guide</div>
                            <div className="text-blue-800 space-y-1">
                                <p><strong>US East (N. Virginia):</strong> email-smtp.us-east-1.amazonaws.com</p>
                                <p><strong>US West (Oregon):</strong> email-smtp.us-west-2.amazonaws.com</p>
                                <p><strong>EU (Ireland):</strong> email-smtp.eu-west-1.amazonaws.com</p>
                                <p className="mt-2"><strong>Port:</strong> 587 (TLS) or 465 (SSL)</p>
                                <p><strong>Username & Password:</strong> Generate SMTP credentials in AWS SES Console → SMTP Settings</p>
                                <p className="mt-2 text-xs text-blue-700">⚠️ Ensure the "From Address" is verified in Amazon SES</p>
                            </div>
                        </div> */}

                        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm">
                            <div className="font-medium text-yellow-900 mb-2">🔐 Domain Verification (Recommended)</div>
                            <div className="text-yellow-800 space-y-2">
                                <p>Instead of verifying individual email addresses, verify your entire domain for better deliverability:</p>
                                <ol className="list-decimal list-inside space-y-1 ml-2">
                                    <li><strong>Go to AWS SES Console</strong> → Verified Identities → Create Identity</li>
                                    <li><strong>Select "Domain"</strong> and enter your domain (e.g., yourdomain.com)</li>
                                    <li><strong>Add DNS records</strong> provided by AWS to your domain registrar:
                                        <ul className="list-disc list-inside ml-4 mt-1">
                                            <li>DKIM records (3 CNAME records for authentication)</li>
                                            <li>MX record (optional, for bounce handling)</li>
                                            <li>TXT record (for domain verification)</li>
                                        </ul>
                                    </li>
                                    <li><strong>Wait for verification</strong> (usually 5-15 minutes, up to 72 hours)</li>
                                    <li><strong>Use any email</strong> from your verified domain (e.g., notifications@yourdomain.com)</li>
                                </ol>
                                <p className="mt-2"><strong>Benefits:</strong> Better deliverability, no need to verify each email, professional setup</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700">
                                    Host <span className="text-red-500">*</span>
                                </label>
                                <input 
                                    type="text" 
                                    name="host" 
                                    value={smtp.host} 
                                    onChange={handleSmtpChange} 
                                    placeholder="email-smtp.us-east-1.amazonaws.com"
                                    className="form-input mt-1 block w-full" 
                                />
                                <div className="text-xs text-gray-500 mt-1">SMTP server hostname</div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">
                                    Port <span className="text-red-500">*</span>
                                </label>
                                <select 
                                    name="port" 
                                    value={smtp.port} 
                                    onChange={handleSmtpChange} 
                                    className="form-input mt-1 block w-full"
                                >
                                    <option value={587}>587 (TLS - Recommended)</option>
                                    <option value={465}>465 (SSL)</option>
                                    <option value={25}>25 (Unsecured)</option>
                                    <option value={2587}>2587 (Alternative TLS)</option>
                                </select>
                                <div className="text-xs text-gray-500 mt-1">Use 587 for Amazon SES</div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">
                                    Username (SMTP Credentials) <span className="text-red-500">*</span>
                                </label>
                                <input 
                                    type="text" 
                                    name="username" 
                                    value={smtp.username} 
                                    onChange={handleSmtpChange} 
                                    placeholder="AKIAIOSFODNN7EXAMPLE"
                                    className="form-input mt-1 block w-full" 
                                />
                                <div className="text-xs text-gray-500 mt-1">AWS SMTP username (starts with AKIA...)</div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">
                                    Password (SMTP Credentials) <span className="text-red-500">*</span>
                                </label>
                                <input 
                                    type="password" 
                                    name="password" 
                                    value={smtp.password} 
                                    onChange={handleSmtpChange} 
                                    placeholder="••••••••••••••••••••"
                                    className="form-input mt-1 block w-full" 
                                />
                                <div className="text-xs text-gray-500 mt-1">AWS SMTP password (from SES Console)</div>
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-sm font-medium text-gray-700">
                                    From Address (Verified Email/Domain) <span className="text-red-500">*</span>
                                </label>
                                <input 
                                    type="email" 
                                    name="fromAddress" 
                                    value={smtp.fromAddress} 
                                    onChange={handleSmtpChange} 
                                    placeholder="notifications@yourdomain.com"
                                    className="form-input mt-1 block w-full" 
                                />
                                <div className="text-xs text-gray-500 mt-1">
                                    Must be from a verified domain or verified individual email (check SES → Verified Identities)
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-between items-center mt-4">
                            <button 
                                onClick={handleTestEmail} 
                                disabled={smtpLoading || !smtp.host || !smtp.username}
                                className="btn btn-secondary flex items-center"
                            >
                                <RefreshCw size={16} />
                                Send Test Email
                            </button>
                            <button 
                                onClick={handleSmtpSave} 
                                disabled={smtpLoading} 
                                className="btn btn-primary flex items-center"
                            >
                                {smtpLoading ? (
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                                ) : (
                                    <Save size={16} />
                                )}
                                {smtpLoading ? 'Saving...' : 'Save SMTP Credentials'}
                            </button>
                        </div>

                        <div className="mt-4 p-3 bg-gray-50 border border-gray-200 rounded text-xs text-gray-600">
                            <strong>Common Issues:</strong>
                            <ul className="list-disc list-inside mt-1 space-y-1">
                                <li><strong>554 Message rejected:</strong> From address/domain not verified in SES</li>
                                <li><strong>Authentication failed:</strong> Wrong SMTP credentials or region mismatch</li>
                                <li><strong>Timeout errors:</strong> Firewall blocking port 587/465</li>
                                <li><strong>Sandbox mode:</strong> Can only send to verified addresses until production access granted</li>
                                <li><strong>DKIM not configured:</strong> Add DKIM DNS records for better deliverability</li>
                            </ul>
                        </div>

                        <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded text-xs">
                            <div className="font-medium text-green-900 mb-1">✅ Quick Verification Checklist</div>
                            <div className="text-green-800 space-y-1">
                                <p>□ Domain/email verified in AWS SES Verified Identities</p>
                                <p>□ DKIM DNS records added (if using domain verification)</p>
                                <p>□ SMTP credentials generated and saved</p>
                                <p>□ Correct region selected (host matches your SES region)</p>
                                <p>□ Production access requested (if sending to non-verified emails)</p>
                                <p>□ Test email sent successfully</p>
                            </div>
                        </div>
                    </div>
                </section>
                )}

                {canAccessSetting('sftp') && (
                <section ref={sectionRefs.sftp} id="sftp" className="scroll-mt-20 mb-16">
                    <div className="card">
                        <div className="mb-4">
                            <h2 className="text-xl font-semibold text-gray-900 flex items-center">
                                <SettingsIcon className="mr-2" size={20} />
                                Ringless Voicemail SFTP Credentials
                            </h2>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Host</label>
                                <input type="text" name="host" value={sftp.host} onChange={handleSftpChange} className="form-input mt-1 block w-full" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Port</label>
                                <input type="number" name="port" value={sftp.port} onChange={handleSftpChange} className="form-input mt-1 block w-full" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Username</label>
                                <input type="text" name="username" value={sftp.username} onChange={handleSftpChange} className="form-input mt-1 block w-full" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Password</label>
                                <input type="password" name="password" value={sftp.password} onChange={handleSftpChange} className="form-input mt-1 block w-full" />
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-sm font-medium text-gray-700">Remote Path</label>
                                <input type="text" name="remotePath" value={sftp.remotePath} onChange={handleSftpChange} className="form-input mt-1 block w-full" />
                            </div>
                        </div>
                        <div className="flex justify-end mt-4">
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={handleFetchNow}
                                    disabled={isFetching}
                                    className="btn btn-primary flex items-center"
                                >
                                    {isFetching ? (
                                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                                    ) : (
                                        <RefreshCw size={16} />
                                    )}
                                    {isFetching ? 'Fetching...' : 'Fetch'}
                                </button>

                                <button
                                    onClick={handleSftpSave}
                                    disabled={sftpLoading}
                                    className="btn btn-primary flex items-center"
                                >
                                    {sftpLoading ? (
                                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                                    ) : (
                                        <Save size={16} />
                                    )}
                                    {sftpLoading ? 'Saving...' : 'Save SFTP Credentials'}
                                </button>
                            </div>
                        </div>
                    </div>
                </section>
                )}

                {canAccessSetting('vicidial') && (
                <section ref={sectionRefs.vicidial} id="vicidial" className="scroll-mt-20 mb-16">
                    <div className="card">
                        <div className="mb-4">
                            <h2 className="text-xl font-semibold text-gray-900 flex items-center">
                                <SettingsIcon className="mr-2" size={20} />
                                Vicidial Credentials
                            </h2>
                            <p className="text-sm text-gray-600 mt-2">
                                Configure Vicidial API credentials for agent statistics and campaign management.
                            </p>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="md:col-span-2">
                                <label className="block text-sm font-medium text-gray-700">API URL</label>
                                <input 
                                    type="text" 
                                    name="url" 
                                    value={vicidial.url} 
                                    onChange={handleVicidialChange} 
                                    className="form-input mt-1 block w-full" 
                                    placeholder="https://server_name/vicidial/non_agent_api.php"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Username</label>
                                <input 
                                    type="text" 
                                    name="username" 
                                    value={vicidial.username} 
                                    onChange={handleVicidialChange} 
                                    className="form-input mt-1 block w-full" 
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Password</label>
                                <input 
                                    type="password" 
                                    name="password" 
                                    value={vicidial.password} 
                                    onChange={handleVicidialChange} 
                                    className="form-input mt-1 block w-full" 
                                />
                            </div>
                        </div>
                        <div className="flex justify-end mt-4">
                            <button
                                onClick={handleVicidialSave}
                                disabled={vicidialLoading}
                                className="btn btn-primary flex items-center"
                            >
                                {vicidialLoading ? (
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                                ) : (
                                    <Save size={16} />
                                )}
                                {vicidialLoading ? 'Saving...' : 'Save Vicidial Credentials'}
                            </button>
                        </div>
                    </div>
                </section>
                )}

                {canAccessSetting('sitecustom') && (
                <section ref={sectionRefs.sitecustom} id="sitecustom" className="scroll-mt-20 mb-16">
                    <div className="card">
                        <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
                            <SettingsIcon className="mr-2" size={20} />
                            Site Customization
                        </h2>

                        <div className="mb-4 text-sm text-gray-600">Configure site title, favicon, logo and login background styling.</div>

                        <div className="grid grid-cols-1 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Site Title</label>
                                <input type="text" value={siteTitle} onChange={(e) => setSiteTitle(e.target.value)} className="form-input mt-1 block w-full" />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Favicon</label>
                                    <input type="file" accept="image/*" onChange={handleFaviconChange} className="mt-1 block w-full" />
                                    <div className="text-xs text-gray-500 mt-1">Allowed: PNG, JPG, SVG, WEBP. Max: {formatBytes(MAX_FAVICON_SIZE)}</div>
                                </div>
                                <div className="md:col-span-2 flex items-center gap-4">
                                    <div className="text-sm text-gray-600">Preview</div>
                                    <div className="h-8 rounded-sm overflow-hidden border border-gray-200">
                                        {faviconPreview ? (
                                            <img src={faviconPreview} alt="favicon preview" className="h-8 w-8 object-contain" />
                                        ) : (
                                            <div className="h-8 p-2 bg-gray-50 flex items-center justify-center text-xs text-gray-400">No file selected</div>
                                        )}
                                    </div>
                                    {faviconFile ? (
                                        <div className="text-xs text-gray-500 ml-2">{formatBytes(faviconFile.size)}</div>
                                    ) : null}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Logo</label>
                                    <input type="file" accept="image/*" onChange={handleLogoChange} className="mt-1 block w-full" />
                                    <div className="text-xs text-gray-500 mt-1">Allowed: PNG, JPG, SVG, WEBP. Max: {formatBytes(MAX_LOGO_SIZE)}</div>
                                </div>
                                <div className="md:col-span-2 flex items-center gap-4">
                                    <div className="text-sm text-gray-600">Preview</div>
                                    <div className="h-16 w-48 rounded-sm overflow-hidden border border-gray-200 flex items-center justify-center bg-white">
                                        {logoPreview ? (
                                            <img src={logoPreview} alt="logo preview" className="h-full object-contain" />
                                        ) : (
                                            <div className="text-xs text-gray-400">No logo selected</div>
                                        )}
                                    </div>
                                    {logoFile ? (
                                        <div className="text-xs text-gray-500 ml-2">{formatBytes(logoFile.size)}</div>
                                    ) : null}
                                </div>
                            </div>

                            <div className="border border-gray-200 p-4 rounded-lg">
                                <div className="flex items-center justify-between mb-3">
                                    <div className="text-sm font-medium text-gray-900">Login Background</div>
                                </div>

                                <div className="flex gap-3 mb-3">
                                    <label className="inline-flex items-center">
                                        <input type="radio" name="loginBgType" value="image" checked={loginBgType === 'image'} onChange={() => setLoginBgType('image')} className="mr-2" />
                                        Image
                                    </label>
                                    <label className="inline-flex items-center">
                                        <input type="radio" name="loginBgType" value="color" checked={loginBgType === 'color'} onChange={() => setLoginBgType('color')} className="mr-2" />
                                        Color
                                    </label>
                                    <label className="inline-flex items-center">
                                        <input type="radio" name="loginBgType" value="gradient" checked={loginBgType === 'gradient'} onChange={() => setLoginBgType('gradient')} className="mr-2" />
                                        Gradient
                                    </label>
                                </div>

                                {loginBgType === 'image' && (
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                                        <div>
                                            <input type="file" accept="image/*" onChange={handleLoginBgImageChange} className="mt-1 block w-full" />
                                            <div className="text-xs text-gray-500 mt-1">Allowed: PNG, JPG, SVG, WEBP. Max: {formatBytes(MAX_LOGIN_BG_SIZE)}</div>
                                        </div>
                                        <div className="md:col-span-2 flex items-center gap-4">
                                            <div className="text-sm text-gray-600">Preview</div>
                                            <div className="h-24 w-full rounded-sm overflow-hidden border border-gray-200 bg-gray-50 flex items-center justify-center">
                                                {loginBgImagePreview ? (
                                                    <img src={loginBgImagePreview} alt="login bg preview" className="h-full object-cover w-full" />
                                                ) : (
                                                    <div className="text-xs text-gray-400">No image selected</div>
                                                )}
                                            </div>
                                            {loginBgImageFile ? (
                                                <div className="text-xs text-gray-500 ml-2">{formatBytes(loginBgImageFile.size)}</div>
                                            ) : null}
                                        </div>
                                    </div>
                                )}

                                {loginBgType === 'color' && (
                                    <div className="flex items-center gap-4">
                                        <label className="text-sm text-gray-700">Pick color</label>
                                        <input type="color" value={loginBgColor} onChange={(e) => setLoginBgColor(e.target.value)} />
                                        <div className="ml-4 h-12 w-40 rounded-sm border" style={{ background: loginBgColor }} />
                                    </div>
                                )}

                                {loginBgType === 'gradient' && (
                                    <div className="flex items-center gap-4">
                                        <div>
                                            <label className="block text-xs text-gray-600">From</label>
                                            <input type="color" value={loginBgGradientFrom} onChange={(e) => setLoginBgGradientFrom(e.target.value)} />
                                        </div>
                                        <div>
                                            <label className="block text-xs text-gray-600">To</label>
                                            <input type="color" value={loginBgGradientTo} onChange={(e) => setLoginBgGradientTo(e.target.value)} />
                                        </div>
                                        <div className="ml-4 h-12 w-40 rounded-sm border" style={{ background: `linear-gradient(90deg, ${loginBgGradientFrom}, ${loginBgGradientTo})` }} />
                                    </div>
                                )}
                            </div>

                            <div className="flex justify-end mt-4">
                                <div className="flex items-center gap-3">
                                    <button onClick={handleResetCustomization} className="btn btn-secondary flex items-center">
                                        <RefreshCw size={16} />
                                        Reset
                                    </button>

                                    <button onClick={handleSaveCustomization} disabled={customLoading} className="btn btn-primary flex items-center">
                                        {customLoading ? (
                                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                                        ) : (
                                            <Save size={16} />
                                        )}
                                        {customLoading ? 'Saving...' : 'Save Customization'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>
                )}

                

                {/* Add/Edit Mautic Client Modal */}
                {isMauticModalOpen && (
                    <AddClientModal
                        isOpen={isMauticModalOpen}
                        onClose={() => setIsMauticModalOpen(false)}
                        onSuccess={() => { setIsMauticModalOpen(false); refetchClients(); }}
                        editClient={editingMauticClient}
                    />
                )}

                {/* Footer */}
                <footer className="mt-20 pt-6 border-t border-gray-200 text-center text-sm text-gray-500">
                    <p>Developed by Digital Bevy &copy; All Rights Reserved</p>
                    <p className="mt-1">Version {packageJson.version}</p>
                </footer>
            </div>
        </div>
    );
};

export default Settings