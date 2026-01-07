import { useEffect, useState } from "react";
import axios from "axios";
import { useAuth } from "../contexts/AuthContext.jsx";
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Users, FolderOpen } from "lucide-react";
import useViewLevel from "../zustand/useViewLevel.js";
import { usePermissions } from "../utils/permissions.js";

export default function ManagerPage({ onBack, onEmployees, onClients }) {
  const [manager, setManager] = useState(null);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const navigate = useNavigate();
  const { hasFullAccess, isTeamManager } = usePermissions(user);

  const { employeesStates } = useViewLevel();
  const { managerId } = employeesStates;

  useEffect(() => {
    if (!user) return;
    // Permission guard
    if (!hasFullAccess() && !isTeamManager()) {
      navigate('/dashboard');
      return;
    }
    axios.get(`/api/users/${managerId}`)
      .then(res => {
        setManager(res.data.user || res.data);
      })
      .catch(err => console.error("Error fetching manager:", err))
      .finally(() => setLoading(false));
  }, [managerId]);

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
        {hasFullAccess() ? 'Back to Managers' : 'Back to Dashboard'}
      </button>

      <div className="flex items-center gap-3 mb-2">
        <h2 className="text-2xl font-bold capitalize">{manager?.name}</h2>

        {manager?.role && (
          <span
            className={`px-3 py-1 text-xs font-bold rounded-full tracking-wide
        ${manager.role === "admin"
                ? "bg-red-100 text-red-700"
                : manager.role === "manager"
                  ? "bg-blue-100 text-blue-700"
                  : "bg-gray-200 text-gray-700"
              }`}
          >
            {manager.role.toUpperCase()}
          </span>
        )}
      </div>


      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div
          className="card cursor-pointer hover:shadow-lg transition-shadow bg-gradient-to-br from-primary-50 to-primary-100 border-primary-200"
          onClick={onEmployees}
        >
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-primary-900">View Employees</h3>
              <p className="text-sm text-primary-700 mt-1">See team members under this manager</p>
            </div>
            <Users size={32} className="text-primary-600" />
          </div>
        </div>

        <div
          className="card cursor-pointer hover:shadow-lg transition-shadow bg-gradient-to-br from-secondary-50 to-secondary-100 border-secondary-200"
          onClick={onClients}
        >
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-secondary-900">View Clients</h3>
              <p className="text-sm text-secondary-700 mt-1">See clients assigned to this manager</p>
            </div>
            <FolderOpen size={32} className="text-secondary-600" />
          </div>
        </div>
      </div>
    </div>
  );
}