import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext.jsx'
import axios from 'axios'
import { Users, FolderOpen, Activity } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import useViewLevel from '../zustand/useViewLevel.js'

const Dashboard = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState({
    totalEmployees: 0,
    totalClients: 0
  });
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState([]);

  const navigate = useNavigate();
  const { employeesStates, setCurrentRoute } = useViewLevel();
  const { currentRoute } = employeesStates;

  useEffect(() => {
    fetchClients();
    fetchDashboardData();
    if (currentRoute === '/employees') {
      navigateToEmployees();
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [clients]);

  const fetchClients = async () => {
    try {
      // Fetch both Mautic and all clients (with assignments)
      const [mauticRes, clientsRes] = await Promise.all([
        axios.get("/api/mautic/clients"),
        axios.get("/api/clients"),
      ]);

      const mauticClients = (mauticRes.data?.data || []).map((c) => ({
        ...c,
        id: c.clientId || c.id,  // keep /api/clients ID for unified display and assignment
        mauticApiId: c.id,       // store the actual Mautic system ID separately
        uniqueId: `mautic-${c.clientId || c.id}`,
        services: ["mautic"],
      }));

      const allClients = clientsRes.data || [];
      console.log(allClients);

      // Extract dropcowboy clients (existing logic)
      const dropCowboyClients = allClients
        .filter((cl) => cl.clientType === "dropcowboy")
        .map((c) => ({
          ...c,
          // `id` here is already the main Client id
          uniqueId: `dropcowboy-${c.id}`,
          services: ["dropcowboy"],
        }));

      const assignmentsByName = new Map();
      const assignmentsByClientId = new Map();

      for (const c of allClients) {
        const key = c.name?.trim().toLowerCase();
        if (key) {
          const existing = assignmentsByName.get(key) || [];
          const newOnes = c.assignments || [];

          // merge by unique userId
          const merged = new Map([
            ...existing.map(a => [a.userId || a.user?.id, a]),
            ...newOnes.map(a => [a.userId || a.user?.id, a]),
          ]);

          assignmentsByName.set(key, Array.from(merged.values()));
        }

        // Also index assignments by main client id when available
        if (c.id) {
          assignmentsByClientId.set(c.id, c.assignments || []);
        }
      }

      // Attach assignments to Mautic clients if found
      mauticClients.forEach((client) => {
        // Prefer assignments linked by main client id (more reliable), fallback to name matching
        let assignments = null;
        if (client.clientId) {
          assignments = assignmentsByClientId.get(client.clientId);
        }

        if (!assignments || assignments.length === 0) {
          const key = (client.name || '').trim().toLowerCase();
          assignments = assignmentsByName.get(key);
        }

        if (assignments && assignments.length > 0) {
          client.assignments = assignments;
        }
      });

      // Merge both services by normalized name
      const mergedMap = new Map();

      [...mauticClients, ...dropCowboyClients].forEach((client) => {
        const key = client.name.trim().toLowerCase();

        if (!mergedMap.has(key)) {
          mergedMap.set(key, {
            ...client,
          });
        } else {
          const existing = mergedMap.get(key);

          // Combine unique assignments by userId
          const indexAssignments = (arr) =>
            (arr || []).map((a) => [a.userId || a.user?.id || a.id, a]);

          const combinedAssignmentsMap = new Map([
            ...indexAssignments(existing.assignments),
            ...indexAssignments(client.assignments),
          ]);

          const merged = {
            ...existing,
            id: existing.id || client.id,
            mauticApiId: existing.mauticApiId || client.mauticApiId || null,
            mauticUrl: existing.mauticUrl || client.mauticUrl,
            isActive: existing.isActive ?? client.isActive ?? true,
            services: Array.from(
              new Set([...(existing.services || []), ...(client.services || [])])
            ),
            assignments: Array.from(combinedAssignmentsMap.values()),
            hasMautic:
              (existing.services || []).includes("mautic") ||
              (client.services || []).includes("mautic"),
            hasDropcowboy:
              (existing.services || []).includes("dropcowboy") ||
              (client.services || []).includes("dropcowboy"),
          };
          mergedMap.set(key, merged);
        }
      });

      // 5️⃣ Final combined list
      let combinedClients = Array.from(mergedMap.values());

      // For non-superadmins, restrict visibility to assigned/created clients only
      if (user && (user.role !== 'superadmin' && user.role !== 'admin')) {
        if (user.role === 'manager') {
          combinedClients = combinedClients.filter((c) => {
            const createdByThisManager = c.createdBy?.id === user.id;
            const assignedToManager = (c.assignments || []).some(a => (a.user?.id || a.userId) === user.id);
            return createdByThisManager || assignedToManager;
          });
        } else {
          // Employee/telecaller - only assigned clients
          combinedClients = combinedClients.filter((c) => (c.assignments || []).some(a => (a.user?.id || a.userId) === user.id));
        }
      }

      // Only display clients that have Mautic/automation service
      combinedClients = combinedClients.filter(c => 
        (c.services || []).includes('mautic') || c.hasMautic
      );

      console.log("Combined clients:", combinedClients);
      setClients(combinedClients);
    } catch (error) {
      console.error("Error fetching clients:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchDashboardData = async () => {
    try {
      const requests = [
        axios.get('/api/users'),
      ];

      const responses = await Promise.all(requests);
      const [employeesRes] = responses;

      const employees = employeesRes.data.users;

      let uniqueClients = Array.from(clients);

      // For non-superadmins, restrict visibility to assigned/created clients only
      if (user && (user.role !== 'superadmin' && user.role !== 'admin')) {
        if (user.role === 'manager') {
          uniqueClients = uniqueClients.filter((c) => {
            const createdByThisManager = c.createdBy?.id === user.id;
            const assignedToManager = (c.assignments || []).some(a => (a.user?.id || a.userId) === user.id);
            return createdByThisManager || assignedToManager;
          });
        } else {
          // Employee/telecaller - only assigned clients
          uniqueClients = uniqueClients.filter((c) => (c.assignments || []).some(a => (a.user?.id || a.userId) === user.id));
        }
      }

      // Only count clients that have Mautic/automation service
      uniqueClients = uniqueClients.filter(c => 
        (c.services || []).includes('mautic') || c.hasMautic
      );

      if (user.role === 'superadmin') {
        setStats({
          totalEmployees: employees.length,
          totalClients: uniqueClients.length,
          totalManagers: employees.filter((e) => e?.role === 'manager').length,
          totalAdmins: employees.filter((e) => e?.role === 'admin').length
        });
      } else if (user.role === 'admin') {
        setStats({
          totalEmployees: employees.length,
          totalClients: uniqueClients.length,
          totalManagers: employees.filter((e) => e?.role === 'manager').length
        });
      } else if (user.role === 'manager') {
        // Manager should only see their direct reports (employees & telecallers)
        const myTeamCount = employees.filter((e) =>
          (e.role === 'employee' || e.role === 'telecaller') && (
            e.managers?.some(m => m.id === user.id) || e.createdById === user.id
          )
        ).length;
        setStats({
          totalEmployees: myTeamCount,
          totalClients: uniqueClients.length,
          totalManagers: 0
        });
      } else {
        setStats({
          totalEmployees: employees.length,
          totalClients: uniqueClients.length,
          totalManagers: 0
        });
      }
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  const navigateToEmployees = () => {
    navigate('/employees');
    setCurrentRoute('/employees');
  };

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
      <div className="card mb-8">
        <h1 className="md:text-3xl font-bold text-gray-900 mb-2">
          {getGreeting()}, {user.name}!
        </h1>
        <p className="text-gray-600 max-sm:text-xs">
          Welcome to your {user.role} dashboard. Here's what's happening today.
        </p>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(250px,1fr))] gap-6 mb-8">
        <div
          onClick={navigateToEmployees}
          className="stats-card bg-gradient-to-br from-primary-500 to-primary-700 cursor-pointer"
        >
          {/* here added -2 because i in dev 2 superadmins are there so fix later - todo: */}
          <div className="text-3xl max-sm:text-xl font-bold mb-2">{stats.totalEmployees  }</div>
          <div className="flex items-center text-sm opacity-90">
            <Users size={16} className="mr-2" />
            {(user.role === 'superadmin' || user.role === 'admin') ? 'Total Employees' : user.role === 'manager' ? 'My Team' : 'Team Members'}
          </div>
        </div>

        <div
          onClick={() => navigate('/clients')}
          className="stats-card bg-gradient-to-br from-secondary-500 to-secondary-700 cursor-pointer"
        >
          <div className="text-3xl max-sm:text-xl font-bold mb-2">{stats.totalClients}</div>
          <div className="flex items-center text-sm opacity-90">
            <FolderOpen size={16} className="mr-2" />
            {(user.role === 'employee' || user.role === 'telecaller') ? 'My Clients' : 'Total Clients'}
          </div>
        </div>

        {user.role === 'superadmin' && (
          <>
            <div
              onClick={navigateToEmployees}
              className="stats-card bg-gradient-to-br from-purple-600 to-purple-800 cursor-pointer"
            >
              <div className="text-3xl max-sm:text-xl font-bold mb-2">{stats.totalAdmins || 0}</div>
              <div className="flex items-center text-sm opacity-90">
                <Activity size={16} className="mr-2" />
                Total Admins
              </div>
            </div>
            <div
              onClick={navigateToEmployees}
              className="stats-card bg-gradient-to-br from-accent-600 to-accent-800 cursor-pointer"
            >
              <div className="text-3xl max-sm:text-xl font-bold mb-2">{stats.totalManagers}</div>
              <div className="flex items-center text-sm opacity-90">
                <Activity size={16} className="mr-2" />
                Total Managers
              </div>
            </div>
          </>
        )}
        {user.role === 'admin' && (
          <div
            onClick={navigateToEmployees}
            className="stats-card bg-gradient-to-br from-accent-600 to-accent-800 cursor-pointer"
          >
            <div className="text-3xl max-sm:text-xl font-bold mb-2">{stats.totalManagers}</div>
            <div className="flex items-center text-sm opacity-90">
              <Activity size={16} className="mr-2" />
              Total Managers
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default Dashboard;