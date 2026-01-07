import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext.jsx'
import axios from 'axios'
import { toast } from 'react-toastify'
import { UserPlus, Edit, Trash2, X, EyeOff, Eye, ToggleLeft, ToggleRight, Shield, Crown, Users, Phone, Mail, Send } from 'lucide-react'
import { usePermissions } from '../utils/permissions'

const Employees = () => {
  const { user } = useAuth()
  const { hasFullAccess, hasPermission } = usePermissions(user)
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingUser, setEditingUser] = useState(null)
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    roleId: '',
    phone: '',
    managerIds: [],
    sendWelcomeEmail: true
  });
  const [showPassword, setShowPassword] = useState(false);
  const [availableRoles, setAvailableRoles] = useState([]);
  const [rolesLoading, setRolesLoading] = useState(true);
  const [ownerId, setOwnerId] = useState(null);
  const [availableManagers, setAvailableManagers] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchEmployees()
    fetchRoles()
    fetchOwner()
    fetchManagers()
  }, [user]);

  const fetchManagers = async () => {
    try {
      const response = await axios.get('/api/users')
      const users = response.data.users || []
      // Filter to only users with team manager permissions (isTeamManager flag on their role)
      const managers = users.filter(u => 
        u.isActive && 
        (u.customRole?.isTeamManager || u.role === 'manager' || u.role === 'admin' || u.role === 'superadmin')
      )
      setAvailableManagers(managers)
    } catch (error) {
      console.error('Error fetching managers:', error)
      setAvailableManagers([])
    }
  };

  const fetchOwner = async () => {
    try {
      const response = await axios.get('/api/superadmin/owner')
      if (response.data.success && response.data.data) {
        setOwnerId(response.data.data.id)
      }
    } catch (error) {
      console.error('Error fetching owner info:', error)
    }
  }

  const isOwner = (userId) => ownerId === userId;

  const fetchRoles = async () => {
    try {
      setRolesLoading(true);
      const response = await axios.get('/api/roles')
      const allRoles = response.data.data?.filter(r => r.isActive) || [];
      
      // Filter roles based on current user's permissions
      let filteredRoles = allRoles;
      
      // Users with full access can assign any role
      // Users without full access cannot assign full access roles
      if (!hasFullAccess()) {
        filteredRoles = allRoles.filter(r => !r.fullAccess);
      }
      
      setAvailableRoles(filteredRoles);
    } catch (error) {
      console.error('Error fetching roles:', error);
      setAvailableRoles([]);
    } finally {
      setRolesLoading(false);
    }
  };

  const togglePasswordVisibility = () => {
    setShowPassword(prev => !prev);
  };

  const fetchEmployees = async () => {
    try {
      const response = await axios.get('/api/users')
      // Show all users - filtering is now handled by backend based on permissions
      setEmployees(response.data.users || [])
    } catch (error) {
      toast.error('Error fetching employees')
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    // Prevent double submission
    if (isSubmitting) return;

    // Password validation for new employee
    if (!editingUser) {
      if (!formData.password) {
        toast.error('Password is required');
        return;
      }
      if (formData.password.length < 8) {
        toast.error('Password must be at least 8 characters');
        return;
      }
      if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).+$/.test(formData.password)) {
        toast.error('Password must contain uppercase, lowercase, number, and special symbol');
        return;
      }
    }
    
    // Validate role selection
    if (!formData.roleId) {
      toast.error('Please select a role');
      return;
    }

    setIsSubmitting(true);

    try {
      if (editingUser) {
        // Update employee - only send customRoleId, backend derives base role
        const updateData = {
          name: formData.name,
          email: formData.email,
          customRoleId: parseInt(formData.roleId),
          phone: formData.phone || null,
          managerIds: formData.managerIds.length > 0 ? formData.managerIds : undefined
        };
        await axios.put(`/api/users/${editingUser.id}`, updateData)
        toast.success('Employee updated successfully')
      } else {
        // Create employee - only send customRoleId, backend derives base role
        const createData = {
          name: formData.name,
          email: formData.email,
          password: formData.password,
          customRoleId: parseInt(formData.roleId),
          phone: formData.phone || null,
          managerIds: formData.managerIds.length > 0 ? formData.managerIds : undefined,
          sendWelcomeEmail: formData.sendWelcomeEmail
        };
        await axios.post('/api/users', createData)
        toast.success('Employee created successfully')
      }

      fetchEmployees()
      fetchManagers() // Refresh managers list in case new employee is a manager
      closeModal()
    } catch (error) {
      const errorMessage = error.response?.data?.error?.message || error.response?.data?.message || 'Operation failed';
      toast.error(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  }

  const handleEdit = (employeeToEdit) => {
    setEditingUser(employeeToEdit)
    setFormData({
      name: employeeToEdit.name,
      email: employeeToEdit.email,
      password: '',
      roleId: employeeToEdit.customRoleId?.toString() || '',
      phone: employeeToEdit.phone || '',
      managerIds: employeeToEdit.managers?.map(m => m.id) || [],
      sendWelcomeEmail: false
    })
    setShowModal(true)
  }

  const handleDelete = async (employeeId) => {
    if (window.confirm('Are you sure you want to delete this employee?')) {
      try {
        await axios.delete(`/api/users/${employeeId}`)
        toast.success('Employee deleted successfully')
        fetchEmployees()
      } catch (error) {
        toast.error(error.response?.data?.message || 'Failed to deactivate employee')
      }
    }
  }
  const toggleActivity = async (userItem) => {
    const newStatus = !userItem.isActive

    // Optimistically update UI
    setEmployees(prev =>
      prev.map(u => (u.id === userItem.id ? { ...u, isActive: newStatus } : u))
    )

    try {
      await axios.put(`/api/users/${userItem.id}`, { isActive: newStatus })
      if (newStatus) {
        toast.success('Employee Reactivated')
      } else {
        toast.error('Employee Deactivated')
      }
    } catch (error) {
      // Revert on error
      setEmployees(prev =>
        prev.map(u => (u.id === userItem.id ? { ...u, isActive: userItem.isActive } : u))
      )
      toast.error(error.response?.data?.message || 'Failed to update employee status')
    }
  }

  const closeModal = () => {
    setShowModal(false)
    setEditingUser(null)
    setFormData({
      name: '',
      email: '',
      password: '',
      roleId: '',
      phone: '',
      managerIds: [],
      sendWelcomeEmail: true
    })
    setIsSubmitting(false)
  }

  // Get display badge class for role - used for styling only
  const getRoleBadgeClass = (employee) => {
    // Use customRole name if available, otherwise fall back to base role
    if (employee.customRole?.name) {
      const name = employee.customRole.name.toLowerCase();
      if (name.includes('super')) return 'badge-superadmin';
      if (name.includes('admin')) return 'badge-admin';
      if (name.includes('manager')) return 'badge-manager';
      if (name.includes('telecaller')) return 'badge-telecaller';
    }
    return roleClassMap[employee.role] || 'badge-employee';
  };

  const roleClassMap = {
    superadmin: 'badge-superadmin',
    admin: 'badge-admin',
    manager: 'badge-manager',
    employee: 'badge-employee',
    telecaller: 'badge-telecaller',
  };

  // Check if user can create employees based on their permissions
  const canCreateEmployee = hasFullAccess() || hasPermission('Users', 'Create');

  if (loading || rolesLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl pb-4 mx-auto px-4 sm:px-6 lg:px-8 animate-fade-in">
      <div className="card">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Employee Management
            </h1>
            <p className="text-gray-600 mt-1">
              Manage employees and their roles
            </p>
          </div>

          {canCreateEmployee && (
            <button
              onClick={() => setShowModal(true)}
              className="btn btn-primary"
            >
              <UserPlus size={16} />
              Add Employee
            </button>
          )}
        </div>

        {employees.length === 0 ? (
          <div className="text-center py-12">
            <UserPlus className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <p className="text-gray-500">No employees found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Email
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Role
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Created By
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {employees.map((userItem, index) => (
                  <tr key={index} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      <div className="flex items-center gap-2">
                        {userItem.name.charAt(0).toUpperCase() + userItem.name.slice(1)}
                        {isOwner(userItem.id) && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800" title="Owner - Protected Account">
                            <Crown size={12} />
                            Owner
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {userItem.email}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`badge ${roleClassMap[userItem.role]}`}>
                        {userItem.customRole?.name || (userItem.role.charAt(0).toUpperCase() + userItem.role.slice(1))}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {userItem.createdBy?.name.charAt(0).toUpperCase() + userItem.createdBy?.name.slice(1) || 'System'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
                        {isOwner(userItem.id) ? (
                          <span className="text-gray-300 cursor-not-allowed" title="Owner account cannot be deactivated">
                            <ToggleRight size={22} />
                          </span>
                        ) : (
                          <button
                            onClick={() => toggleActivity(userItem)}
                            className="focus:outline-none"
                            title={userItem.isActive ? 'Deactivate' : 'Reactivate'}
                          >
                            {userItem.isActive ? (
                              <ToggleRight className="text-green-500" size={22} />
                            ) : (
                              <ToggleLeft className="text-gray-400" size={22} />
                            )}
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleEdit(userItem)}
                          className="text-indigo-600 hover:text-indigo-900"
                          title="Edit Employee"
                        >
                          <Edit size={16} />
                        </button>
                        {!isOwner(userItem.id) && (
                          <button
                            onClick={() => handleDelete(userItem.id)}
                            className="text-red-600 hover:text-red-900"
                            title="Delete Employee"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-10 mx-auto p-6 border w-[480px] shadow-lg rounded-lg bg-white max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-semibold text-gray-900">
                {editingUser ? 'Edit Employee' : 'Create New Employee'}
              </h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Basic Information Section */}
              <div className="space-y-4">
                <h4 className="text-sm font-medium text-gray-700 border-b pb-2">Basic Information</h4>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="form-label flex items-center gap-2">
                      <UserPlus size={14} className="text-gray-500" />
                      Full Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="form-input"
                      placeholder="John Doe"
                      required
                    />
                  </div>

                  <div>
                    <label className="form-label flex items-center gap-2">
                      <Mail size={14} className="text-gray-500" />
                      Email <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="form-input"
                      placeholder="john@example.com"
                      required
                    />
                  </div>

                  <div>
                    <label className="form-label flex items-center gap-2">
                      <Phone size={14} className="text-gray-500" />
                      Phone Number
                    </label>
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="form-input"
                      placeholder="+1 (555) 123-4567"
                    />
                  </div>
                </div>
              </div>

              {/* Security Section - Only for new users */}
              {!editingUser && (
                <div className="space-y-4">
                  <h4 className="text-sm font-medium text-gray-700 border-b pb-2">Security</h4>
                  
                  <div>
                    <label className="form-label">Password <span className="text-red-500">*</span></label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        className="form-input pr-10"
                        placeholder="Enter a secure password"
                        required
                        minLength="8"
                      />
                      <button
                        type="button"
                        className="absolute inset-y-0 right-0 pr-3 flex items-center"
                        onClick={togglePasswordVisibility}
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4 text-gray-400" />
                        ) : (
                          <Eye className="h-4 w-4 text-gray-400" />
                        )}
                      </button>
                    </div>
                    <p className={`text-xs mt-1 ${formData.password && !/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).+$/.test(formData.password) ? 'text-amber-600' : 'text-gray-500'}`}>
                      {formData.password && !/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).+$/.test(formData.password)
                        ? 'Include uppercase, lowercase, number, and special character'
                        : 'Min 8 chars with uppercase, lowercase, number, and special character'}
                    </p>
                  </div>
                </div>
              )}

              {/* Role & Permissions Section */}
              <div className="space-y-4">
                <h4 className="text-sm font-medium text-gray-700 border-b pb-2">Role & Permissions</h4>
                
                <div>
                  <label className="form-label flex items-center gap-2">
                    <Shield size={14} className="text-blue-600" />
                    Role <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.roleId}
                    onChange={(e) => setFormData({ ...formData, roleId: e.target.value })}
                    className="form-select"
                    required
                  >
                    <option value="">Select a role</option>
                    {availableRoles.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.name} {role.fullAccess ? '(Full Access)' : role.isTeamManager ? '(Team Manager)' : ''}
                      </option>
                    ))}
                  </select>
                  {availableRoles.length === 0 && (
                    <p className="text-xs text-amber-600 mt-1">
                      No roles available. Please create roles in Settings first.
                    </p>
                  )}
                </div>

                {hasFullAccess() && availableManagers.length > 0 && (
                  <div>
                    <label className="form-label flex items-center gap-2">
                      <Users size={14} className="text-purple-600" />
                      Assign Manager(s)
                    </label>
                    <select
                      multiple
                      value={formData.managerIds.map(String)}
                      onChange={(e) => {
                        const selected = Array.from(e.target.selectedOptions, option => parseInt(option.value));
                        setFormData({ ...formData, managerIds: selected });
                      }}
                      className="form-select h-24"
                    >
                      {availableManagers
                        .filter(m => !editingUser || m.id !== editingUser.id)
                        .map((manager) => (
                          <option key={manager.id} value={manager.id}>
                            {manager.name} ({manager.customRole?.name || manager.role})
                          </option>
                        ))}
                    </select>
                    <p className="text-xs text-gray-500 mt-1">
                      Hold Ctrl/Cmd to select multiple. Optional - leave empty if no manager needed.
                    </p>
                  </div>
                )}
              </div>

              {/* Notification Settings - Only for new users */}
              {!editingUser && (
                <div className="space-y-4">
                  <h4 className="text-sm font-medium text-gray-700 border-b pb-2">Notifications</h4>
                  
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.sendWelcomeEmail}
                      onChange={(e) => setFormData({ ...formData, sendWelcomeEmail: e.target.checked })}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <span className="flex items-center gap-2 text-sm text-gray-700">
                      <Send size={14} className="text-green-600" />
                      Send welcome email with login credentials
                    </span>
                  </label>
                </div>
              )}

              {/* Form Actions */}
              <div className="flex justify-end space-x-3 pt-4 border-t mt-6">
                <button
                  type="button"
                  onClick={closeModal}
                  className="btn btn-secondary"
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary flex items-center gap-2"
                  disabled={isSubmitting || availableRoles.length === 0}
                >
                  {isSubmitting ? (
                    <>
                      <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span>
                      {editingUser ? 'Updating...' : 'Creating...'}
                    </>
                  ) : (
                    editingUser ? 'Update Employee' : 'Create Employee'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default Employees