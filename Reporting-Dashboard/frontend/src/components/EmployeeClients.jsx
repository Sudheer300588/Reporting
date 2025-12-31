import axios from "axios";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "../contexts/AuthContext.jsx";
import useViewLevel from "../zustand/useViewLevel.js";

export default function EmployeeClients({ onBack }) {
  const [clients, setClients] = useState([]);
  const [employee, setEmployee] = useState(null);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  const { employeesStates } = useViewLevel();
  const { employeeId } = employeesStates;

  useEffect(() => {
    if (!user) return; // wait for auth
    const fetchEmployeeClients = async () => {
      try {
        const clientsRes = await axios.get(`/api/users/${employeeId}/clients`);
        const empRes = await axios.get(`/api/users/${employeeId}`);

        const clientsData = clientsRes.data.success ? clientsRes.data.data : (Array.isArray(clientsRes.data) ? clientsRes.data : []);
        const employeeData = empRes.data.user || empRes.data;

        // clientsRes returns only clients assigned to this user
        setClients(Array.isArray(clientsData) ? clientsData : []);
        setEmployee(employeeData);
      } catch (err) {
        console.error("Error fetching employee clients or details:", err);
        if (err.response?.status === 403) {
          console.error("Access denied. You may not have permission to view this employee's clients.");
        }
        setClients([]);
      } finally {
        setLoading(false);
      }
    };

    fetchEmployeeClients();
  }, [employeeId, user]);

  const getManagerId = () => {
    return employee?.managers?.[0]?.id;
  };

  const handleUnassign = async (clientId) => {
    if (!confirm('Unassign this client from the employee?')) return;
    try {
      await axios.delete(`/api/clients/${clientId}/assign/${employeeId}`);
      // Re-fetch list
      const clientsRes = await axios.get(`/api/users/${employeeId}/clients`);
      const clientsData = clientsRes.data.success ? clientsRes.data.data : (Array.isArray(clientsRes.data) ? clientsRes.data : []);
      setClients(clientsData || []);
    } catch (err) {
      console.error('Error unassigning client from employee:', err);
      alert(err.response?.data?.message || 'Failed to unassign client');
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
        {user.role === 'superadmin' || user.role === 'manager' ? 'Back to Employees' : 'Back to Dashboard'}
      </button>

      <div className="card mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold capitalize">
              {employee ? `${employee.name}'s Clients` : "Employee's Clients"}
            </h2>
            {employee?.managers && employee.managers.length > 0 && (
              <div className="text-sm text-gray-500">Manager: <strong>{employee.managers[0].name}</strong></div>
            )}
            {employee && (
              <div className="mt-2 flex items-center gap-4 text-sm text-gray-600">
                <span>{employee.email}</span>
                <span className="px-2 py-1 bg-primary-100 text-primary-700 rounded-full text-xs font-medium capitalize">
                  {employee.role}
                </span>
              </div>
            )}
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold text-primary-600">{clients.length}</div>
            <div className="text-sm text-gray-500">Total Clients</div>
          </div>
        </div>
      </div>

      {clients.length === 0 ? (
        <div className="card text-center py-12">
          <div className="text-gray-400 mb-4">
            <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
          </div>
          <p className="text-gray-500 text-lg">No clients assigned to this employee</p>
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
                      {(user?.role === 'superadmin' || user?.role === 'manager') && (
                        <button onClick={() => handleUnassign(c.id)} className="px-3 py-1 bg-red-50 text-red-600 rounded-lg hover:bg-red-100">Unassign</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
