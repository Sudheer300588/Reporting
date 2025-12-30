import { useEffect, useState } from "react";
import { useNavigate } from 'react-router-dom';
import axios from "axios";
import { ArrowLeft } from "lucide-react";
import ManagerPage from "./ManagerPage";
import ManagerEmployees from "./ManagerEmployees";
import ManagerClients from "./ManagerClients";
import EmployeeClients from "./EmployeeClients";
import { useAuth } from "../contexts/AuthContext.jsx";
import useViewLevel from "../zustand/useViewLevel.js";

export default function HierarchyPage() {
  // const [view, setEmpView] = useState("list"); // list, manager, managerEmployees, managerClients, employeeClients
  // const [activeManagerId, setActiveManagerId] = useState(null);
  // const [activeEmployeeId, setActiveEmployeeId] = useState(null);

  const [managers, setManagers] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  const { user } = useAuth();
  const navigate = useNavigate();
  const { employeesStates, setEmpView, setCurrentRoute, setActiveManagerId, setActiveEmployeeId } = useViewLevel();
  const { view, currentRoute } = employeesStates;

  useEffect(() => {
    if (view === "list") {
      // If logged-in user is an employee/telecaller, show their clients only
      if (user && (user.role === 'employee' || user.role === 'telecaller')) {
        setActiveEmployeeId(user.id);
        setEmpView('employeeClients');
        setLoading(false);
        return;
      }

      // If logged-in user is a manager, show their own manager page (hierarchy)
      if (user && user.role === 'manager') {
        setActiveManagerId(user.id);
        setEmpView('manager');
        setLoading(false);
        return;
      }

      axios.get("/api/users")
        .then(res => {
          const users = res.data.users;
          const managerUsers = users.filter(u => u.role === "manager");
          setManagers(managerUsers);
          setAllUsers(users);
        })
        .catch(err => console.error("Error fetching managers:", err))
        .finally(() => setLoading(false));
    }
  }, [view]);

  const goHome = () => {
    // Navigate to dashboard for consistent behaviour
    navigate('/dashboard');
    setCurrentRoute('/dashboard');
  };

  if (loading && view === "list") {
    return (
      <div className="p-6">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* VIEW 1: MANAGERS LIST */}
      {view === "list" && (
        <>
          <button
            onClick={goHome}
            className="flex items-center text-primary-600 hover:text-primary-700 mb-4"
          >
            <ArrowLeft size={20} className="mr-2" />
            Back to Dashboard
          </button>

          {/* Stat Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <div className="card bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-purple-600">Total Managers</p>
                  <p className="text-3xl font-bold text-purple-900 mt-2">{managers.length}</p>
                </div>
                <div className="p-3 bg-purple-200 rounded-full">
                  <svg className="w-8 h-8 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                </div>
              </div>
            </div>

            <div className="card bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-blue-600">Total Employees</p>
                  <p className="text-3xl font-bold text-blue-900 mt-2">
                    {allUsers.filter(u => u.role === 'employee' || u.role === 'telecaller').length}
                  </p>
                </div>
                <div className="p-3 bg-blue-200 rounded-full">
                  <svg className="w-8 h-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
              </div>
            </div>

            <div className="card bg-gradient-to-br from-green-50 to-green-100 border-green-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-green-600">Active Users</p>
                  <p className="text-3xl font-bold text-green-900 mt-2">
                    {allUsers.filter(u => u.isActive).length}
                  </p>
                </div>
                <div className="p-3 bg-green-200 rounded-full">
                  <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="flex items-center justify-between mb-6">
              <h1 className="text-2xl font-bold">Managers</h1>
              <div className="text-right">
                <div className="text-3xl font-bold text-primary-600">{managers.length}</div>
                <div className="text-sm text-gray-500">Total Managers</div>
              </div>
            </div>

            {managers.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-gray-400 mb-4">
                  <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                </div>
                <p className="text-gray-500 text-lg">No managers found</p>
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
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {managers.map(m => (
                      <tr
                        key={m.id}
                        onClick={() => {
                          setActiveManagerId(m.id);
                          setEmpView("manager");
                        }}
                        className="hover:bg-gray-50 transition-colors cursor-pointer"
                      >
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="font-semibold text-gray-900 capitalize">{m.name}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-600">{m.email}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-medium capitalize">
                            {m.role}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* VIEW 2: MANAGER PAGE */}
      {view === "manager" && (
        <ManagerPage
          // managerId={activeManagerId}
          onBack={user.role === 'superadmin' ? () => setEmpView("list") : goHome}
          onEmployees={() => setEmpView("managerEmployees")}
          onClients={() => setEmpView("managerClients")}
        />
      )}

      {/* VIEW 3: MANAGER EMPLOYEES */}
      {view === "managerEmployees" && (
        <ManagerEmployees
          // managerId={activeManagerId}
          onBack={() => setEmpView("manager")}
          onEmployeeClick={(eid) => {
            setActiveEmployeeId(eid);
            setEmpView("employeeClients");
          }}
        />
      )}

      {/* VIEW 4: MANAGER CLIENTS */}
      {view === "managerClients" && (
        <ManagerClients
          // managerId={activeManagerId}
          onBack={() => setEmpView("manager")}
        />
      )}

      {/* VIEW 5: EMPLOYEE CLIENTS */}
      {view === "employeeClients" && (
        <EmployeeClients
          // employeeId={activeEmployeeId}
          onBack={
            user && (user.role === 'employee' || user.role === 'telecaller')
              ? goHome
              : () => setEmpView('managerEmployees')
          }
        />
      )}
    </div>
  );
}