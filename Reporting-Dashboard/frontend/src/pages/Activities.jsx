import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import {
    Activity,
    Users,
    FolderOpen,
    Search,
    Filter,
    ChevronLeft,
    ChevronRight,
    Calendar,
    User,
    Settings
} from 'lucide-react';

const Activities = () => {
    const { user } = useAuth();
    const [activities, setActivities] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState({
        target: '',
        action: '',
        search: ''
    });
    const [pagination, setPagination] = useState({
        current: 1,
        pages: 1,
        total: 0
    });

    useEffect(() => {
        fetchActivities();
    }, [filters, pagination.current]);

    const fetchActivities = async () => {
        try {
            setLoading(true);
            const params = new URLSearchParams({
                page: pagination.current,
                limit: 20,
                ...filters
            });

            const response = await axios.get(`/api/activities?${params}`);
            setActivities(response.data.activities);
            setPagination(response.data.pagination);
        } catch (error) {
            console.error('Error fetching activities:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleFilterChange = (key, value) => {
        setFilters(prev => ({ ...prev, [key]: value }));
        setPagination(prev => ({ ...prev, current: 1 }));
    };

    const handlePageChange = (page) => {
        setPagination(prev => ({ ...prev, current: page }));
    };

    const getActivityIcon = (action) => {
        if (action.includes('employee') || action.includes('telecaller')) return <Users className="h-5 w-5 text-blue-500" />;
        if (action.includes('project')) return <FolderOpen className="h-5 w-5 text-green-500" />;
        if (action === 'login' || action === 'logout') return <User className="h-5 w-5 text-purple-500" />;
        return <Activity className="h-5 w-5 text-gray-500" />;
    };

    const getActionColor = (action) => {
        switch (action) {
            case 'user_created':
            case 'project_created':
                return 'text-green-600 bg-green-100';
            case 'user_updated':
            case 'project_updated':
            case 'project_status_changed':
                return 'text-blue-600 bg-blue-100';
            case 'user_deleted':
            case 'project_deleted':
                return 'text-red-600 bg-red-100';
            case 'login':
                return 'text-purple-600 bg-purple-100';
            case 'logout':
                return 'text-gray-600 bg-gray-100';
            default:
                return 'text-gray-600 bg-gray-100';
        }
    };

    const capitalizeFirstLetter = (str) => {
        if (typeof str !== 'string' || str.length === 0) {
            return "";
        }
        return str.charAt(0).toUpperCase() + str.slice(1);
    };

    if (user.role === 'employee' || user.role === 'telecaller') {
        return (
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="text-center py-12">
                    <Activity className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">Access Restricted</h3>
                    <p className="text-gray-500">Activity logs are only available to Admins and Managers.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-7xl pb-4 mx-auto px-4 sm:px-6 lg:px-8 animate-fade-in">
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-gray-900 mb-2">Activity Log</h1>
                <p className="text-gray-600">Track all system activities and user actions</p>
            </div>

            {/* Filters */}
            <div className="card mb-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                        <label className="form-label">Search</label>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
                            <input
                                type="text"
                                className="form-input pl-10"
                                placeholder="Search activities..."
                                value={filters.search}
                                onChange={(e) => handleFilterChange('search', e.target.value)}
                            />
                        </div>
                    </div>

                    <div>
                        <label className="form-label">Target</label>
                        <select
                            className="form-select"
                            value={filters.target}
                            onChange={(e) => handleFilterChange('target', e.target.value)}
                        >
                            <option value="">All Targets</option>
                            <option value="user">Users</option>
                            <option value="project">Projects</option>
                            <option value="system">System</option>
                        </select>
                    </div>

                    <div>
                        <label className="form-label">Action</label>
                        <select
                            className="form-select"
                            value={filters.action}
                            onChange={(e) => handleFilterChange('action', e.target.value)}
                        >
                            <option value="">All Actions</option>
                            <option value="user_created">User Created</option>
                            <option value="user_updated">User Updated</option>
                            <option value="user_deleted">User Deleted</option>
                            <option value="project_created">Project Created</option>
                            <option value="project_updated">Project Updated</option>
                            <option value="project_deleted">Project Deleted</option>
                            <option value="project_status_changed">Status Changed</option>
                            <option value="login">Login</option>
                            <option value="logout">Logout</option>
                        </select>
                    </div>

                    <div className="flex items-end">
                        <button
                            onClick={() => {
                                setFilters({ target: '', action: '', search: '' });
                                setPagination(prev => ({ ...prev, current: 1 }));
                            }}
                            className="btn btn-secondary w-full"
                        >
                            <Filter size={16} />
                            Clear Filters
                        </button>
                    </div>
                </div>
            </div>

            {/* Activities List */}
            <div className="card">
                {loading ? (
                    <div className="flex items-center justify-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
                    </div>
                ) : activities.length === 0 ? (
                    <div className="text-center py-12">
                        <Activity className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                        <h3 className="text-lg font-medium text-gray-900 mb-2">No Activities Found</h3>
                        <p className="text-gray-500">Try adjusting your filters to see more results.</p>
                    </div>
                ) : (
                    <>
                        <div className="space-y-4">
                            {activities.map((activity) => (
                                <div key={activity.id} className="flex items-start space-x-4 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                                    <div className="flex-shrink-0 mt-1">
                                        {getActivityIcon(activity.action)}
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="flex items-center space-x-2">
                                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getActionColor(activity.action)}`}>
                                                    {activity.action.replace('_', ' ').toUpperCase()}
                                                </span>
                                                <span className="text-sm text-gray-500">
                                                    by {activity.user?.name || 'Unknown User'}
                                                </span>
                                            </div>
                                            <div className="flex items-center text-xs text-gray-500">
                                                <Calendar size={12} className="mr-1" />
                                                {new Date(activity.createdAt).toLocaleString()}
                                            </div>
                                        </div>

                                        <p className="text-sm text-gray-900 mb-2">{capitalizeFirstLetter(activity.description)}</p>

                                        {activity.metadata && Object.keys(activity.metadata).length > 0 && (
                                            <div className="text-xs text-gray-500 bg-gray-100 rounded p-2">
                                                <strong>Details:</strong> {JSON.stringify(activity.metadata, null, 2)}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Pagination */}
                        {pagination.pages > 1 && (
                            <div className="flex items-center justify-between mt-6 pt-6 border-t border-gray-200">
                                <div className="text-sm text-gray-700">
                                    Showing page {pagination.current} of {pagination.pages} ({pagination.total} total activities)
                                </div>

                                <div className="flex items-center space-x-2">
                                    <button
                                        onClick={() => handlePageChange(pagination.current - 1)}
                                        disabled={pagination.current === 1}
                                        className="btn btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        <ChevronLeft size={16} />
                                        Previous
                                    </button>

                                    <div className="flex items-center space-x-1">
                                        {Array.from({ length: Math.min(5, pagination.pages) }, (_, i) => {
                                            const page = i + 1;
                                            return (
                                                <button
                                                    key={page}
                                                    onClick={() => handlePageChange(page)}
                                                    className={`px-3 py-1 rounded text-sm ${page === pagination.current
                                                        ? 'bg-primary-600 text-white'
                                                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                                                        }`}
                                                >
                                                    {page}
                                                </button>
                                            );
                                        })}
                                    </div>

                                    <button
                                        onClick={() => handlePageChange(pagination.current + 1)}
                                        disabled={pagination.current === pagination.pages}
                                        className="btn btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        Next
                                        <ChevronRight size={16} />
                                    </button>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default Activities;