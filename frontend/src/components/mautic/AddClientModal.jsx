/**
 * Add Client Modal Component
 * 
 * Modal for adding/editing Autovation Clients
 */

import React, { useState, useEffect } from 'react';
import { X, Check, Loader, AlertCircle, Eye, EyeOff, Users } from 'lucide-react';
import { useClientManagement } from '../../hooks/mautic';
import { isValidUrl } from '../../utils/mautic';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import { hasFullAccess } from '../../utils/permissions';
import Select from 'react-select';

export default function AddClientModal({ isOpen, onClose, onSuccess, editClient = null }) {
    const { user } = useAuth();
    const [formData, setFormData] = useState({
        name: '',
        mauticUrl: '',
        username: '',
        password: '',
        reportId: '4',
        assignToManager: '',
        assignToEmployees: [],
        fromDate: '',
        toDate: '',
        limit: 200000,
        page: 1
    });
    const [errors, setErrors] = useState({});
    const [testResult, setTestResult] = useState(null);
    const [showPassword, setShowPassword] = useState(false);
    const [managers, setManagers] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [filteredEmployees, setFilteredEmployees] = useState([]);
    const [customBackfill, setCustomBackfill] = useState(false);

    const { createClient, updateClient, testConnection, isCreating, isUpdating, isTesting } = useClientManagement();

    const togglePasswordVisibility = () => {
        setShowPassword(prev => !prev);
    };

    // Fetch users (managers and employees) when modal opens
    useEffect(() => {
        if (isOpen && hasFullAccess(user)) {
            fetchUsers();
        }
    }, [isOpen, user]);

    const fetchUsers = async () => {
        try {
            const response = await axios.get('/api/users');
            const allUsers = response.data.users || response.data;

            // Filter managers: users with isTeamManager flag in their customRole
            const managersList = allUsers.filter(u => 
                u.isActive && u.customRole?.isTeamManager
            );
            
            // Filter employees: active users who are NOT team managers and do NOT have full access
            const employeesList = allUsers.filter(u => 
                u.isActive && 
                !u.customRole?.isTeamManager && 
                !u.customRole?.fullAccess
            );

            setManagers(managersList);
            setEmployees(employeesList);
        } catch (error) {
            console.error('Error fetching users:', error);
        }
    };

    // Filter employees based on selected manager
    useEffect(() => {
        if (formData.assignToManager) {
            const selectedManagerId = parseInt(formData.assignToManager);
            // Get employees managed by this manager (via managers relation)
            const managedEmployees = employees.filter(emp =>
                emp.managers?.some(m => m.id === selectedManagerId)
            );
            setFilteredEmployees(managedEmployees);
        } else {
            // Show all employees when no manager is selected
            setFilteredEmployees(employees);
        }
    }, [formData.assignToManager, employees]);

    useEffect(() => {
        const fetchPasswordForEdit = async () => {
            if (editClient) {
                try {
                    const response = await axios.get(`/api/mautic/clients/${editClient.id}/password`);
                    if (response.data.success) {
                        const pwd = response.data.data.password;
                        setFormData({
                            name: editClient.name,
                            mauticUrl: editClient.mauticUrl,
                            username: editClient.username,
                            password: pwd,
                            reportId: editClient.reportId?.toString() || '4',
                            assignToManager: '',
                            assignToEmployees: []
                        });
                    }
                } catch (error) {
                    console.error('Error fetching password:', error);
                    setFormData({
                        name: editClient.name,
                        mauticUrl: editClient.mauticUrl,
                        username: editClient.username,
                        password: '',
                        reportId: editClient.reportId?.toString() || '4',
                        assignToManager: '',
                        assignToEmployees: []
                    });
                }
            } else {
                setFormData({
                    name: '',
                    mauticUrl: '',
                    username: '',
                    password: '',
                    reportId: '4',
                    assignToManager: '',
                    assignToEmployees: []
                });
            }
            setErrors({});
            setTestResult(null);
        };

        if (isOpen) {
            fetchPasswordForEdit();
        }
    }, [editClient, isOpen]);

    const validateForm = () => {
        const newErrors = {};

        if (!formData.name.trim()) {
            newErrors.name = 'Name is required';
        }

        if (!formData.mauticUrl.trim()) {
            newErrors.mauticUrl = 'Mautic URL is required';
        } else if (!isValidUrl(formData.mauticUrl)) {
            newErrors.mauticUrl = 'Invalid URL format';
        }

        if (!formData.username.trim()) {
            newErrors.username = 'Username is required';
        }

        if (!editClient && !formData.password.trim()) {
            newErrors.password = 'Password is required';
        }

        if (!formData.reportId.trim()) {
            newErrors.reportId = 'Report ID is required';
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleTestConnection = async () => {
        if (!validateForm()) return;

        setTestResult(null);
        const result = await testConnection({
            mauticUrl: formData.mauticUrl,
            username: formData.username,
            password: formData.password
        });

        setTestResult(result);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!validateForm()) return;

        // Prepare data for submission
        const submitData = {
            name: formData.name,
            mauticUrl: formData.mauticUrl,
            username: formData.username,
            password: formData.password,
            reportId: formData.reportId,
            assignToManager: formData.assignToManager || null,
            assignToEmployees: formData.assignToEmployees || [],
            page: formData.page || undefined
        };

        // Only include custom backfill params when user explicitly enables it
        if (customBackfill) {
            if (formData.fromDate) submitData.fromDate = formData.fromDate;
            if (formData.toDate) submitData.toDate = formData.toDate;
            if (formData.limit) submitData.limit = formData.limit;
        }

        const result = editClient
            ? await updateClient(editClient.id, submitData)
            : await createClient(submitData);

        if (result.success) {
            onSuccess();
            onClose();
        } else {
            setErrors({ submit: result.error });
        }
    };

    const handleChange = (e) => {
        const { name, value } = e.target;

        if (name === 'assignToEmployees') {
            // Handle multi-select for employees
            const options = e.target.options;
            const selected = [];
            for (let i = 0; i < options.length; i++) {
                if (options[i].selected) {
                    selected.push(parseInt(options[i].value));
                }
            }
            setFormData(prev => ({ ...prev, [name]: selected }));
        } else {
            setFormData(prev => ({ ...prev, [name]: value }));
        }

        // Clear error for this field
        if (errors[name]) {
            setErrors(prev => ({ ...prev, [name]: undefined }));
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto transition-transform transform scale-100 hover:scale-105">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-200">
                    <h2 className="text-xl font-semibold text-gray-900">
                        {editClient ? 'Edit Client' : 'Add New Client'}
                    </h2>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-full"
                        aria-label="Close modal"
                    >
                        <X size={24} />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-6 space-y-6">
                    {/* Name */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Client Name *
                        </label>
                        <input
                            type="text"
                            name="name"
                            value={formData.name}
                            onChange={handleChange}
                            className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow ${errors.name ? 'border-red-500' : 'border-gray-300'}`}
                            placeholder="e.g., My Company"
                            aria-describedby="name-error"
                        />
                        {errors.name && (
                            <p id="name-error" className="mt-1 text-xs text-red-600">
                                {errors.name}
                            </p>
                        )}
                    </div>

                    {/* Mautic URL */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Autovation URL *
                        </label>
                        <input
                            type="text"
                            name="mauticUrl"
                            value={formData.mauticUrl}
                            onChange={handleChange}
                            className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow ${errors.mauticUrl ? 'border-red-500' : 'border-gray-300'}`}
                            placeholder="https://your-mautic-instance.com"
                            aria-describedby="mauticUrl-error"
                        />
                        {errors.mauticUrl && (
                            <p id="mauticUrl-error" className="mt-1 text-xs text-red-600">
                                {errors.mauticUrl}
                            </p>
                        )}
                    </div>

                    {/* Username */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Username *
                        </label>
                        <input
                            type="text"
                            name="username"
                            value={formData.username}
                            onChange={handleChange}
                            className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow ${errors.username ? 'border-red-500' : 'border-gray-300'}`}
                            placeholder="Autovation  username"
                            aria-describedby="username-error"
                        />
                        {errors.username && (
                            <p id="username-error" className="mt-1 text-xs text-red-600">
                                {errors.username}
                            </p>
                        )}
                    </div>

                    {/* Password */}
                    {!editClient && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Password *
                            </label>
                            <div className="relative">
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    name="password"
                                    value={formData.password}
                                    onChange={handleChange}
                                    className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow ${errors.password ? 'border-red-500' : 'border-gray-300'}`}
                                    placeholder="••••••••"
                                    aria-describedby="password-error"
                                />
                                <button
                                    type="button"
                                    className="absolute inset-y-0 right-0 pr-3 flex items-center focus:outline-none"
                                    onClick={togglePasswordVisibility}
                                    aria-label="Toggle password visibility"
                                >
                                    {showPassword ? (
                                        <EyeOff className="h-5 w-5 text-gray-400" />
                                    ) : (
                                        <Eye className="h-5 w-5 text-gray-400" />
                                    )}
                                </button>
                            </div>
                            {errors.password && (
                                <p id="password-error" className="mt-1 text-xs text-red-600">
                                    {errors.password}
                                </p>
                            )}
                        </div>
                    )}

                    {/* Report ID - Show in both create and edit modes */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Report ID *
                        </label>
                        <input
                            type="text"
                            name="reportId"
                            value={formData.reportId}
                            onChange={handleChange}
                            className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow ${errors.username ? 'border-red-500' : 'border-gray-300'}`}
                            placeholder="Autovation  report ID"
                            aria-describedby="reportId-error"
                        />
                        {errors.reportId && (
                            <p id="reportId-error" className="mt-1 text-xs text-red-600">
                                {errors.reportId}
                            </p>
                        )}
                    </div>

                    {/* Historical Data Backfill Section - optional custom backfill */}
                    <div className="border-t border-gray-200 pt-4 mt-4">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-sm font-semibold text-gray-700">
                                Historical Data Backfill (Optional)
                            </h3>
                            <label className="flex items-center gap-2 text-sm text-gray-600">
                                <input
                                    type="checkbox"
                                    checked={customBackfill}
                                    onChange={(e) => setCustomBackfill(e.target.checked)}
                                />
                                <span>Enable custom backfill</span>
                            </label>
                        </div>

                        {customBackfill && (
                            <>
                                <div className="grid grid-cols-2 gap-3 mb-3">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            From Date
                                        </label>
                                        <input
                                            type="date"
                                            name="fromDate"
                                            value={formData.fromDate}
                                            onChange={handleChange}
                                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            To Date
                                        </label>
                                        <input
                                            type="date"
                                            name="toDate"
                                            value={formData.toDate}
                                            onChange={handleChange}
                                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Limit (records per request)
                                    </label>
                                    <input
                                        type="number"
                                        name="limit"
                                        value={formData.limit}
                                        onChange={handleChange}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        placeholder="5000"
                                    />
                                </div>

                                <p className="mt-2 text-xs text-gray-500">
                                    {editClient
                                        ? 'Fetch additional historical reports for this client (e.g., next month of data)'
                                        : 'Optionally fetch historical reports for a specific date range after client creation'}
                                </p>
                            </>
                        )}
                    </div>

                    {/* Assignment Section */}
                    {hasFullAccess(user) && !editClient && (
                        <div className="border-t border-gray-200 pt-4 mt-4">
                            <div className="flex items-center gap-2 mb-3">
                                <Users size={18} className="text-gray-600" />
                                <h3 className="text-sm font-semibold text-gray-700">Assign to Users (Optional)</h3>
                            </div>

                            {/* Assign to Manager */}
                            <div className="mb-3">
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Assign to Manager
                                </label>
                                <select
                                    name="assignToManager"
                                    value={formData.assignToManager}
                                    onChange={handleChange}
                                    className="w-full px-4 bg-white py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow"
                                >
                                    <option value="">-- Select Manager --</option>
                                    {managers.map(manager => (
                                        <option key={manager.id} value={manager.id}>
                                            {manager.name} ({manager.email})
                                        </option>
                                    ))}
                                </select>
                                <p className="mt-1 text-xs text-gray-500">
                                    Select a manager to also assign their employees
                                </p>
                            </div>

                            {/* Assign to Employees */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Assign to Employees
                                </label>
                                <Select
                                    isMulti
                                    name="assignToEmployees"
                                    options={filteredEmployees.map(emp => ({
                                        value: emp.id,
                                        label: `${emp.name} (${emp.email}) - ${emp.role}`
                                    }))}
                                    value={formData.assignToEmployees.map(id => {
                                        const emp = filteredEmployees.find(emp => emp.id === id);
                                        return emp ? { value: emp.id, label: `${emp.name} (${emp.email}) - ${emp.role}` } : null;
                                    }).filter(Boolean)}
                                    onChange={(selectedOptions) => {
                                        const selectedIds = selectedOptions.map(option => option.value);
                                        setFormData(prev => ({ ...prev, assignToEmployees: selectedIds }));
                                    }}
                                    classNamePrefix="react-select"
                                />
                                <p className="mt-1 text-xs text-gray-500">
                                    Select multiple employees by typing or choosing from the list
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Test Connection Result */}
                    {testResult && (
                        <div className={`p-3 rounded-lg flex items-start gap-2 ${testResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
                            }`}>
                            {testResult.success ? (
                                <Check className="text-green-600 flex-shrink-0 mt-0.5" size={18} />
                            ) : (
                                <AlertCircle className="text-red-600 flex-shrink-0 mt-0.5" size={18} />
                            )}
                            <p className={`text-sm ${testResult.success ? 'text-green-800' : 'text-red-800'}`}>
                                {testResult.message}
                            </p>
                        </div>
                    )}

                    {/* Submit Error */}
                    {errors.submit && (
                        <div className="p-3 rounded-lg bg-red-50 border border-red-200 flex items-start gap-2">
                            <AlertCircle className="text-red-600 flex-shrink-0 mt-0.5" size={18} />
                            <p className="text-sm text-red-800">{errors.submit}</p>
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-3 pt-4">
                        <button
                            type="button"
                            onClick={handleTestConnection}
                            disabled={isTesting}
                            className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            {isTesting && <Loader className="animate-spin" size={16} />}
                            Test Connection
                        </button>
                        <button
                            type="submit"
                            disabled={isCreating || isUpdating}
                            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            {(isCreating || isUpdating) && <Loader className="animate-spin" size={16} />}
                            {editClient ? 'Update' : 'Create'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}