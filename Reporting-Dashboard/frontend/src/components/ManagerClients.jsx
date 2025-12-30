import axios from "axios";
import { useEffect, useState } from "react";
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from "lucide-react";
import { useAuth } from "../contexts/AuthContext.jsx";
import useViewLevel from "../zustand/useViewLevel.js";

export default function ManagerClients({ onBack }) {
  const [clients, setClients] = useState([]);
  const [manager, setManager] = useState(null);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const navigate = useNavigate();
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedClientForAssign, setSelectedClientForAssign] = useState(null);
  const [assignData, setAssignData] = useState({ userId: '' });
  const [employeesForManager, setEmployeesForManager] = useState([]);
  const [showAssignManagerModal, setShowAssignManagerModal] = useState(false);
  const [availableClientsForManager, setAvailableClientsForManager] = useState([]);
  const [assignManagerClientId, setAssignManagerClientId] = useState(null);

  const { employeesStates } = useViewLevel();
  const { managerId } = employeesStates;

  const fetchClients = async () => {
    try {
      const [clientsRes, managerRes] = await Promise.all([
        axios.get("/api/clients"),
        axios.get(`/api/users/${managerId}`)
      ]);

      const managerClients = clientsRes.data.filter(c =>
        c.assignments?.some(a => a.user.id == managerId && a.user.role === "manager")
      );

      setClients(managerClients);
      setManager(managerRes.data.user || managerRes.data);
    } catch (err) {
      console.error("Error fetching data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user) return; // wait for auth to be ready
    // Guard: only manager or superadmin should access this page
    if (!['manager', 'superadmin'].includes(user?.role)) {
      navigate('/dashboard');
      return;
    }
    fetchClients();
    if (user?.role === 'manager' && parseInt(managerId) === user.id) {
      fetchEmployeesForManager(managerId);
    }
  }, [managerId, user]);

  const fetchEmployeesForManager = async (mid) => {
    try {
      const response = await axios.get(`/api/clients/assignment/managers/${mid}/employees`);
      const employees = response.data.employees || [];
      setEmployeesForManager(employees);
      return employees;
    } catch (err) {
      console.error('Error fetching employees for manager:', err);
      setEmployeesForManager([]);
      return [];
    }
  };

  const fetchAvailableClientsToAssign = async () => {
    try {
      const resp = await axios.get('/api/clients');
      const allClients = resp.data || [];
      const notAssigned = allClients.filter(c => !c.assignments?.some(a => a.user.id == managerId && a.user.role === 'manager'));
      setAvailableClientsForManager(notAssigned);
    } catch (err) {
      console.error('Error fetching available clients for manager assign:', err);
      setAvailableClientsForManager([]);
    }
  };

  const handleAssignForManager = async (e) => {
    e.preventDefault();
    if (!selectedClientForAssign || !assignData.userId) {
      alert('Please select an employee to assign');
      return;
    }
    try {
      await axios.post(`/api/clients/${selectedClientForAssign.id}/assign`, { userId: assignData.userId });
      setShowAssignModal(false);
      setSelectedClientForAssign(null);
      // Refresh clients list
      const resp = await axios.get('/api/clients');
      const managerClients = resp.data.filter(cl =>
        cl.assignments?.some(a => a.user.id == managerId && a.user.role === 'manager')
      );
      setClients(managerClients);
    } catch (err) {
      console.error('Error assigning employee:', err);
      alert(err.response?.data?.message || 'Failed to assign employee');
    }
  };

  const handleAssignManager = async (clientId) => {
    try {
      await axios.post(`/api/clients/${clientId}/assign`, { userId: managerId });
      await fetchClients();
      await fetchAvailableClientsToAssign();
    } catch (err) {
      console.error('Error assigning manager to client:', err);
      alert(err.response?.data?.message || 'Failed to assign manager');
    }
  };

  const handleUnassignManager = async (clientId) => {
    if (!confirm('Unassign this manager from the client?')) return;
    try {
      await axios.delete(`/api/clients/${clientId}/assign/${managerId}`);
      await fetchClients();
    } catch (err) {
      console.error('Error unassigning manager:', err);
      alert(err.response?.data?.message || 'Failed to unassign manager');
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <button
        onClick={onBack}
        className="flex items-center text-primary-600 hover:text-primary-700 mb-4"
      >
        <ArrowLeft size={20} className="mr-2" />
        Back to Manager
      </button>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div className="card bg-gradient-to-br from-secondary-50 to-secondary-100 border-secondary-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-secondary-600">Total Clients</p>
              <p className="text-3xl font-bold text-secondary-900 mt-2">{clients.length}</p>
            </div>
            <div className="p-3 bg-secondary-200 rounded-full">
              <svg className="w-8 h-8 text-secondary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
              </svg>
            </div>
          </div>
        </div>

        <div className="card bg-gradient-to-br from-green-50 to-green-100 border-green-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-green-600">Active Clients</p>
              <p className="text-3xl font-bold text-green-900 mt-2">
                {clients.filter(c => c.isActive).length}
              </p>
            </div>
            <div className="p-3 bg-green-200 rounded-full">
              <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="card bg-gradient-to-br from-red-50 to-red-100 border-red-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-red-600">Inactive Clients</p>
              <p className="text-3xl font-bold text-red-900 mt-2">
                {clients.filter(c => !c.isActive).length}
              </p>
            </div>
            <div className="p-3 bg-red-200 rounded-full">
              <svg className="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      <div className="card mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">Clients under {manager?.name}</h2>
            <p className="text-sm text-gray-600 mt-1">{manager?.email}</p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold text-secondary-600">{clients.length}</div>
            <div className="text-sm text-gray-500">Total Clients</div>
          </div>
        </div>
      </div>
      {user?.role === 'superadmin' && (
        <div className="mb-4 flex justify-end">
          <button
            onClick={() => { fetchAvailableClientsToAssign(); setShowAssignManagerModal(true); }}
            className="px-3 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100"
          >
            Assign Manager to Client
          </button>
        </div>
      )}

      {clients.length === 0 ? (
        <div className="card text-center py-12">
          <div className="text-gray-400 mb-4">
            <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
          </div>
          <p className="text-gray-500 text-lg">No clients assigned to this manager</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Client Name
                  </th>

                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {clients.map(c => (
                  <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="font-semibold text-gray-900">{c.name}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${c.isActive
                        ? 'bg-green-100 text-green-800'
                        : 'bg-red-100 text-red-800'
                        }`}>
                        {c.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      {/* Superadmins can unassign managers from clients */}
                      {user?.role === 'superadmin' && (
                        <button
                          onClick={() => handleUnassignManager(c.id)}
                          className="px-3 py-1 bg-red-50 text-red-600 rounded-lg hover:bg-red-100"
                        >
                          Unassign
                        </button>
                      )}
                      {/* Manager can assign employees to this client (if viewing own manager page) */}
                      {user?.role === 'manager' && parseInt(managerId) === user.id && (
                        <button
                          onClick={() => {
                            setSelectedClientForAssign(c);
                            setAssignData({ userId: '' });
                            fetchEmployeesForManager(managerId);
                            setShowAssignModal(true);
                          }}
                          className="ml-2 px-3 py-1 bg-green-50 text-green-600 rounded-lg hover:bg-green-100"
                        >
                          Assign Employee
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {/* Assign Modal for Managers to assign employees to client */}
      {showAssignModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h2 className="text-2xl font-bold mb-4">Assign Employee to {selectedClientForAssign?.name}</h2>
            <form onSubmit={handleAssignForManager} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Employee</label>
                <select
                  value={assignData.userId}
                  onChange={(e) => setAssignData({ userId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select employee...</option>
                  {employeesForManager.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.name} ({emp.email})</option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <button type="button" onClick={() => { setShowAssignModal(false); setSelectedClientForAssign(null); setAssignData({ userId: '' }); }} className="px-4 py-2 border rounded-lg hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={!assignData.userId} className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50">Assign</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Assign Manager Modal for Superadmin */}
      {showAssignManagerModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h2 className="text-2xl font-bold mb-4">Assign Manager to Client</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Client</label>
                <select
                  value={assignManagerClientId || ''}
                  onChange={(e) => setAssignManagerClientId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select client...</option>
                  {availableClientsForManager.map(c => (
                    <option key={c.id} value={c.id}>{c.name} ({c.company || c.email || 'No company'})</option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <button type="button" onClick={() => { setShowAssignManagerModal(false); setAssignManagerClientId(null); }} className="px-4 py-2 border rounded-lg hover:bg-gray-50">Cancel</button>
                <button type="button" onClick={async () => {
                  if (!assignManagerClientId) return alert('Please select a client');
                  await handleAssignManager(assignManagerClientId);
                  setShowAssignManagerModal(false);
                  setAssignManagerClientId(null);
                }} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">Assign</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}