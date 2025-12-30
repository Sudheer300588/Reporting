import { useState, useEffect, useRef, createContext, useContext } from 'react';
import { Settings as SettingsIcon, Shield } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

const SettingsContext = createContext(null);

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within SettingsLayout');
  }
  return context;
};

const SECTION_CONFIG = [
  { key: 'roles', label: 'Roles', superadminOnly: true },
  { key: 'mautic', label: 'Autovation Clients' },
  { key: 'notifs', label: 'Notifications' },
  { key: 'maintenance', label: 'System Maintenance Email' },
  { key: 'smtp', label: 'SMTP Credentials' },
  { key: 'sftp', label: 'Voicemail SFTP Credentials' },
  { key: 'vicidial', label: 'Vicidial Credentials' },
  { key: 'sitecustom', label: 'Site Customization' },
];

const SettingsLayout = ({ children, myPermissions = [] }) => {
  const { user } = useAuth();
  const [activeSection, setActiveSection] = useState('mautic');
  const isInteractingRef = useRef(false);
  const contentRef = useRef(null);
  const sectionRefs = useRef({});

  const registerSection = (key, ref) => {
    sectionRefs.current[key] = ref;
  };

  const scrollToSection = (key) => {
    setActiveSection(key);
    sectionRefs.current[key]?.scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    });
  };

  useEffect(() => {
    const handleScroll = () => {
      if (isInteractingRef.current) return;

      const sections = ['roles', 'mautic', 'notifs', 'maintenance', 'smtp', 'sftp', 'vicidial', 'sitecustom'];

      for (const key of sections) {
        const el = sectionRefs.current[key];
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

  const canAccessSetting = (settingKey) => {
    if (user?.role === 'superadmin') return true;
    if (user?.role === 'admin') {
      return myPermissions.includes(settingKey);
    }
    return false;
  };

  const visibleSections = SECTION_CONFIG.filter(({ key, superadminOnly }) => {
    if (superadminOnly && user?.role !== 'superadmin') return false;
    if (user?.role === 'superadmin') return true;
    if (user?.role === 'admin') {
      return myPermissions.includes(key);
    }
    return false;
  });

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

  const contextValue = {
    activeSection,
    setActiveSection,
    registerSection,
    scrollToSection,
    canAccessSetting,
    isInteractingRef,
    user,
    myPermissions
  };

  return (
    <SettingsContext.Provider value={contextValue}>
      <div className="flex max-w-7xl mx-auto px-4 py-8">
        <nav className="hidden md:block w-72 pr-8 border-r border-gray-200 sticky top-8 h-[calc(100vh-4rem)] overflow-y-auto">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Settings</h2>
            <p className="text-sm text-gray-500">Manage system configuration</p>
          </div>
          <ul className="space-y-1 text-sm">
            {visibleSections.map(({ key, label }) => (
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
                  <SettingsIcon size={18} className={activeSection === key ? 'text-blue-600' : 'text-gray-400'} />
                  <span className="flex-1">{label}</span>
                  {activeSection === key && (
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-600"></div>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div
          ref={contentRef}
          className="flex-1 ml-0 md:ml-8 pb-10 overflow-y-auto max-h-screen"
        >
          {children}
        </div>
      </div>
    </SettingsContext.Provider>
  );
};

export default SettingsLayout;
