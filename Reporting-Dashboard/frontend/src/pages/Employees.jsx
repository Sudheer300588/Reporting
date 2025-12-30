import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext.jsx'
import axios from 'axios'
import { toast } from 'react-toastify'
import { UserPlus, Edit, Trash2, X, EyeOff, Eye, ToggleLeft, ToggleRight } from 'lucide-react'

const Employees = () => {
  const { user } = useAuth()
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingUser, setEditingUser] = useState(null)
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'employee'
  });
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    fetchEmployees()
  }, []);

  const togglePasswordVisibility = () => {
    setShowPassword(prev => !prev);
  };

  const fetchEmployees = async () => {
    try {
      const response = await axios.get('/api/users')
      // Filter out admin users from the list
      const filteredEmployees = response.data.users.filter(userItem => userItem.role !== 'superadmin')
      setEmployees(filteredEmployees)
    } catch (error) {
      toast.error('Error fetching employees')
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

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
    try {
      if (editingUser) {
        // Update employee
        await axios.put(`/api/users/${editingUser.id}`, {
          name: formData.name,
          email: formData.email,
          role: formData.role
        })
        toast.success('Employee updated successfully')
      } else {
        // Create employee
        await axios.post('/api/users', formData)
        toast.success('Employee created successfully')
      }

      fetchEmployees()
      closeModal()
    } catch (error) {
      const errorMessage = error.response?.data?.error?.message || error.response?.data?.message || 'Operation failed';
      toast.error(errorMessage);
    }
  }

  const handleEdit = (employeeToEdit) => {
    setEditingUser(employeeToEdit)
    setFormData({
      name: employeeToEdit.name,
      email: employeeToEdit.email,
      password: '',
      role: employeeToEdit.role
    })
    setShowModal(true)
  }

  const handleDelete = async (employeeId) => {
    console.log(employeeId);

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
      role: 'employee'
    })
  }

  const roleClassMap = {
    superadmin: 'badge-superadmin',
    admin: 'badge-admin',
    manager: 'badge-manager',
    employee: 'badge-employee',
    telecaller: 'badge-telecaller',
  };

  const canCreateEmployee = user?.role === 'superadmin' || user?.role === 'admin' || user?.role === 'manager';
  
  // Role hierarchy: superadmin can create any role below, admin can create manager/employee/telecaller, manager can create employee/telecaller
  const availableRoles = 
    user?.role === 'superadmin' ? ['admin', 'manager', 'employee', 'telecaller'] :
    user?.role === 'admin' ? ['manager', 'employee', 'telecaller'] :
    ['employee', 'telecaller'];

  if (loading) {
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
                      {userItem.name.charAt(0).toUpperCase() + userItem.name.slice(1)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {userItem.email}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`badge ${roleClassMap[userItem.role]}`}>
                        {userItem.role.charAt(0).toUpperCase() + userItem.role.slice(1)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {userItem.createdBy?.name.charAt(0).toUpperCase() + userItem.createdBy?.name.slice(1) || 'System'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
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
                        <button
                          onClick={() => handleDelete(userItem.id)}
                          className="text-red-600 hover:text-red-900"
                          title="Delete Employee"
                        >
                          <Trash2 size={16} />
                        </button>
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
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium text-gray-900">
                {editingUser ? 'Edit Employee' : 'Create New Employee'}
              </h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="form-label">Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="form-input"
                  required
                />
              </div>

              <div>
                <label className="form-label">Email</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="form-input"
                  required
                />
              </div>

              {!editingUser && (
                <div>
                  <label className="form-label">Password</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      className="form-input"
                      required
                      minLength="6"
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
                  <p className="text-xs text-gray-500 mt-1">
                    {formData.password && !/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).+$/.test(formData.password)
                      ? 'Password should include uppercase, lowercase, number, and special symbol.'
                      : 'Minimum 8 characters'}
                  </p>
                </div>
              )}

              <div>
                <label className="form-label">Role</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  className="form-select"
                  required
                >
                  {availableRoles.map((role, index) => (
                    <option key={index} value={role}>
                      {role.charAt(0).toUpperCase() + role.slice(1)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={closeModal}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                >
                  {editingUser ? 'Update Employee' : 'Create Employee'}
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