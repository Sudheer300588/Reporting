import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'
import axios from 'axios'
import {
    LogOut, User, Users, FolderOpen, BarChart3, Activity, Settings,
    CheckSquare, Bell, Menu, X, UserPlus, HeartHandshake
} from 'lucide-react'

const Navbar = () => {
    const { user, logout } = useAuth();
    const location = useLocation();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [siteLogo, setSiteLogo] = useState(null);

    useEffect(() => {
        let mounted = true;
        axios.get('/api/site-config').then(res => {
            const site = res.data?.data;
            if (!mounted || !site) return;
            if (site.logoPath) setSiteLogo(site.logoPath);
        }).catch(() => {});

        // listen for immediate updates when customization is changed in Settings
        const handler = (ev) => {
            const payload = ev?.detail;
            if (payload && payload.logoPath) setSiteLogo(payload.logoPath);
            // if payload doesn't include logoPath, clear if null
            if (payload && payload.logoPath === null) setSiteLogo(null);
        };
        window.addEventListener('site-customization-updated', handler);
        return () => { window.removeEventListener('site-customization-updated', handler); mounted = false };
    }, []);

    const isActive = (path) => location.pathname === path;

    // Helper to check if user has full access
    const hasFullAccess = () => {
        if (user?.customRole?.fullAccess === true) return true;
        if (!user?.customRoleId && ['superadmin', 'admin'].includes(user?.role)) return true;
        return false;
    };

    // Helper to check page access from customRole.permissions.Pages
    const hasPageAccess = (pageKey) => {
        if (hasFullAccess()) return true;
        
        // Check customRole.permissions.Pages
        const pages = user?.customRole?.permissions?.Pages;
        if (pages && pages[pageKey] === true) return true;
        
        // Backward compatibility for legacy users without customRole
        if (!user?.customRoleId) {
            if (['superadmin', 'admin'].includes(user?.role)) return true;
            if (user?.role === 'manager') {
                return ['Dashboard', 'Clients', 'Users', 'Services', 'Activities', 'Notifications'].includes(pageKey);
            }
            if (['employee', 'telecaller'].includes(user?.role)) {
                return ['Dashboard', 'Clients', 'Notifications'].includes(pageKey);
            }
        }
        return false;
    };

    // 🔹 Define nav links dynamically with page keys matching permissions.Pages
    const navLinks = [
        { to: '/dashboard', label: 'Dashboard', icon: BarChart3, pageKey: 'Dashboard' },
        { to: '/clients', label: 'Clients', icon: UserPlus, pageKey: 'Clients' },
        { to: '/users', label: 'Employees', icon: Users, pageKey: 'Users' },
        { to: '/services', label: 'Services', icon: HeartHandshake, pageKey: 'Services' },
        { to: '/activities', label: 'Activities', icon: Activity, pageKey: 'Activities' },
        { to: '/notifications', label: 'Notifications', icon: Bell, pageKey: 'Notifications' },
        { to: '/settings', label: 'Settings', icon: Settings, pageKey: 'Settings' }
    ];

    const filteredLinks = navLinks.filter(link => hasPageAccess(link.pageKey));

    const linkClass = (path, isMobile = false) =>
        `flex items-center space-x-${isMobile ? 3 : 1} px-${isMobile ? 3 : 2} py-2 rounded-lg text-sm font-medium transition-all duration-200 whitespace-nowrap ${isActive(path)
            ? 'text-primary-600 bg-primary-50 border border-primary-200'
            : 'text-gray-600 hover:text-primary-600 hover:bg-gray-50'
        }`;

    return (
        <nav className="bg-white shadow-lg border-b border-gray-200 mb-6 sticky top-0 z-50">
            <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between items-center h-16 w-full">

                    {/* Logo */}
                    <Link to="/dashboard" className="flex items-center hover:opacity-80 transition-opacity shrink-0">
                        {siteLogo ? (
                            // show only rectangular logo when available
                            <img src={siteLogo} alt="Site Logo" className="h-8 w-auto rounded-none object-contain" />
                        ) : (
                            <>
                                <img src="/logo.png" alt="Digital Bevy" className="h-8 w-8 mr-2 rounded-full object-contain" />
                            </>
                        )}
                    </Link>

                    {/* Desktop Nav */}
                    <div className="hidden lg:flex items-center space-x-1 flex-1 justify-center max-w-4xl">
                        {filteredLinks.map(({ to, label, icon: Icon }) => (
                            <Link key={to} to={to} className={linkClass(to)}>
                                <Icon size={14} />
                                <span className="max-xl:text-xs">{label}</span>
                            </Link>
                        ))}
                    </div>

                    {/* Mobile Toggle */}
                    <div className="lg:hidden">
                        <button
                            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                            className="flex items-center justify-center p-2 rounded-lg text-gray-600 hover:text-primary-600 hover:bg-gray-50 transition-all duration-200"
                        >
                            {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
                        </button>
                    </div>

                    {/* User Actions */}
                    <div className="hidden lg:flex items-center space-x-2 flex-shrink-0">
                        <Link
                            to="/profile"
                            className="flex items-center space-x-2 px-2 py-2 rounded-lg text-sm font-medium text-gray-700 hover:text-primary-600 hover:bg-gray-50 transition-all duration-200"
                        >
                            <div className="w-7 h-7 bg-gradient-to-br from-secondary-100 to-primary-100 rounded-full flex items-center justify-center border border-primary-200">
                                <User size={14} className="text-primary-600" />
                            </div>
                            <div className="hidden xl:block">
                                <div className="text-sm font-medium text-gray-900 truncate max-w-24">{user?.name}</div>
                                <div className="text-xs text-gray-500 capitalize">{user?.customRole?.name || user?.role}</div>
                            </div>
                        </Link>

                        <button
                            onClick={logout}
                            className="flex items-center space-x-1 px-2 py-2 rounded-lg text-sm font-medium text-gray-600 hover:text-red-600 hover:bg-red-50 transition-all duration-200"
                        >
                            <LogOut size={14} />
                            <span className="hidden xl:inline">Logout</span>
                        </button>
                    </div>
                </div>

                {/* Mobile Menu */}
                {isMobileMenuOpen && (
                    <div className="lg:hidden border-t border-gray-200 bg-white">
                        <div className="px-4 py-3 space-y-1">
                            {filteredLinks.map(({ to, label, icon: Icon }) => (
                                <Link
                                    key={to}
                                    to={to}
                                    onClick={() => setIsMobileMenuOpen(false)}
                                    className={linkClass(to, true)}
                                >
                                    <Icon size={16} />
                                    <span>{label}</span>
                                </Link>
                            ))}

                            {/* Mobile User & Logout */}
                            <div className="border-t border-gray-200 pt-3 mt-3">
                                <Link
                                    to="/profile"
                                    onClick={() => setIsMobileMenuOpen(false)}
                                    className="flex items-center space-x-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-700 hover:text-primary-600 hover:bg-gray-50 transition-all duration-200"
                                >
                                    <div className="w-6 h-6 bg-gradient-to-br from-secondary-100 to-primary-100 rounded-full flex items-center justify-center border border-primary-200">
                                        <User size={12} className="text-primary-600" />
                                    </div>
                                    <div>
                                        <div className="text-sm font-medium text-gray-900">{user?.name}</div>
                                        <div className="text-xs text-gray-500 capitalize">{user?.customRole?.name || user?.role}</div>
                                    </div>
                                </Link>

                                <button
                                    onClick={() => {
                                        logout()
                                        setIsMobileMenuOpen(false)
                                    }}
                                    className="flex items-center space-x-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-600 hover:text-red-600 hover:bg-red-50 transition-all duration-200 w-full"
                                >
                                    <LogOut size={16} />
                                    <span>Logout</span>
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </nav>
    )
}

export default Navbar