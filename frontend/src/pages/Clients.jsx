import { useState, useEffect } from "react";
import axios from "axios";
import { useAuth } from "../contexts/AuthContext";
import { ArrowLeft } from "lucide-react";
import ClientsDropCowboyDashboard from "../components/dropCowboy/ClientsDropCowboyDashboard";
import MauticEmailsSection from "../components/mautic/MauticEmailsSection";
import MauticCampaignsSection from "../components/mautic/MauticCampaignsSection";
import MauticSmsSection from "../components/mautic/MauticSmsSection";
import useViewLevel from "../zustand/useViewLevel";
import ClientServicesSection from "../components/ClientServicesSection";
import { usePermissions } from "../utils/permissions";
import clientService from "../services/clientService";

const Clients = () => {
    const {
        view, setView,
        selectedClient, setSelectedClient,
        setSelectedService,
        selectedCampaign, setSelectedCampaign,
        campaigns, setCampaigns,
        loadingCampaigns, setLoadingCampaigns
    } = useViewLevel();

    const { user } = useAuth();
    const { hasFullAccess, hasPermission, isTeamManager, canCreateClients, canEditClients, canDeleteClients } = usePermissions(user);
    const [clients, setClients] = useState([]);
    const [loading, setLoading] = useState(true);

    const canManageTeam = isTeamManager;
    const [showAssignModal, setShowAssignModal] = useState(false);
    const [selectedClientForAssign, setSelectedClientForAssign] = useState(null);
    // users list replaced by managers/employees endpoints
    const [managers, setManagers] = useState([]);
    const [employeesForManager, setEmployeesForManager] = useState({});
    const [searchTerm, setSearchTerm] = useState("");
    const [filterStatus, setFilterStatus] = useState("all");
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage] = useState(10);
    const [assignData, setAssignData] = useState({
        managerId: "",
        userIds: [],
    });

    const fetchClients = async () => {
        try {
            setLoading(true);
            
            // ✅ Use optimized client service with caching
            const unifiedClients = await clientService.getUnifiedClients();
            
            setClients(unifiedClients);
        } catch (error) {
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchClients();
        // Fetch managers if user can manage clients
        if (canManageTeam()) {
            fetchManagers();
        }
    }, [user]);

    const fetchManagers = async () => {
        try {
            const managers = await clientService.getManagers();
            setManagers(managers);
        } catch (error) {
        }
    };

    const fetchEmployeesForManager = async (managerId) => {
        if (!managerId) return [];
        try {
            const employees = await clientService.getEmployeesForManager(managerId);
            setEmployeesForManager((prev) => ({ ...prev, [managerId]: employees }));
            return employees;
        } catch (error) {
            return [];
        }
    };

    const fetchAllEmployees = async () => {
        // For superadmin: fetch all employees (and managers) list
        try {
            const response = await axios.get(`/api/superadmin/employees`);
            const employees = (response.data?.data || []).map((e) => ({
                id: e.id,
                name: e.name,
                email: e.email,
                role: e.role,
            }));
            setEmployeesForManager((prev) => ({ ...prev, all: employees }));
            return employees;
        } catch (err) {
            return [];
        }
    };

    const openServiceSelection = (client) => {
        setSelectedClient(client);
        setView("services");
    };

    const openMauticCampaigns = async () => {
        setView("campaigns");
        setLoadingCampaigns(true);

        try {
            const clientId = selectedClient.id;
            if (!clientId) {
                setLoadingCampaigns(false);
                return;
            }
            
            // ✅ Use optimized client service with caching and parallel loading
            const [campaignsData, segmentsData, emailsData] = await Promise.all([
                clientService.getMauticCampaigns(clientId),
                clientService.getMauticSegments(clientId),
                clientService.getMauticEmails(clientId),
            ]);

            const campaignsWithDetails = campaignsData.map((c) => {
                const campaignEmails = emailsData.filter((e) =>
                    e.name.toLowerCase().includes(c.name.toLowerCase().split(":")[0])
                );
                return { ...c, emails: campaignEmails, segments: segmentsData };
            });

            setCampaigns(campaignsWithDetails);
        } catch (error) {
            setCampaigns([]);
        } finally {
            setLoadingCampaigns(false);
        }
    };

    const openDropcowboyCampaigns = () => {
        setView("dropcowboy");
    };

    const openSmsCampaigns = () => {
        setView("sms");
    };

    const openCampaignDetails = (campaign) => {
        setSelectedCampaign(campaign);
        setView("details");
    };

    const goBackToClients = () => {
        setView("clients");
        setSelectedClient(null);
        setSelectedService(null);
        setSelectedCampaign(null);
    };

    const goBackToServices = () => {
        setView("services");
        setSelectedCampaign(null);
    };

    const goBackToCampaigns = () => {
        setView("campaigns");
        setSelectedCampaign(null);
    };

    const handleAssign = async (e) => {
        e.preventDefault();
        try {
            // Manager optional; employees can be multiple
            const mgrId = assignData.managerId ? parseInt(assignData.managerId) : null;
            const userIds = assignData.userIds || [];

            if (!mgrId && userIds.length === 0) {
                throw new Error('Please select at least a manager or an employee');
            }

            // ✅ Use optimized client service
            // Assign manager first (if provided)
            if (mgrId) {
                try {
                    await clientService.assignClient(selectedClientForAssign.id, { userId: mgrId });
                } catch (mgrErr) {
                }
            }

            // Assign all selected employees
            for (const uid of userIds) {
                try {
                    await clientService.assignClient(selectedClientForAssign.id, { userId: uid });
                } catch (uErr) {
                }
            }

            setShowAssignModal(false);
            setAssignData({ managerId: "", userIds: [] });
            setSelectedClientForAssign(null);
            fetchClients();
        } catch (error) {
            alert(error.response?.data?.message || "Error assigning client");
        }
    };

    const handleUnassign = async (clientId, userId, assignmentClientId = null) => {
        if (!window.confirm('Unassign this user from the client?')) return;
        try {
            // ✅ Use optimized client service
            await clientService.unassignClient(clientId, userId, assignmentClientId);
            fetchClients();
        } catch (err) {
            alert(err.response?.data?.message || 'Failed to unassign user');
        }
    };

    const openAssignModal = (client) => {
        setSelectedClientForAssign(client);
        const initialData = { managerId: "", userIds: [] };
        // If user is a team manager but not full access, pre-select themselves
        if (canManageTeam() && !hasFullAccess()) {
            initialData.managerId = user.id.toString();
        }
        setAssignData(initialData);
        // Preload employees if manager is pre-selected
        if (initialData.managerId) {
            fetchEmployeesForManager(parseInt(initialData.managerId));
        }
        setShowAssignModal(true);
    };

    const getManagers = () => {
        const assignedUserIds =
            selectedClientForAssign?.assignments?.map((a) => a.userId) || [];
        // Non-full access team managers only see themselves
        if (canManageTeam() && !hasFullAccess()) {
            return managers.filter((m) => m.id === user.id && !assignedUserIds.includes(m.id));
        }
        return managers.filter((m) => !assignedUserIds.includes(m.id));
    };

    const getEmployeesUnderManager = (managerId) => {
        if (!managerId) return [];
        const assignedUserIds =
            selectedClientForAssign?.assignments?.map((a) => a.userId) || [];
        const cached = employeesForManager[managerId];
        if (cached) {
            return cached.filter((emp) => !assignedUserIds.includes(emp.id));
        }
        // Trigger async fetch and return empty until data arrives
        fetchEmployeesForManager(parseInt(managerId));
        return [];
    };

    const getEmployeesForSuperadminOrAdmin = () => {
        const assignedUserIds =
            selectedClientForAssign?.assignments?.map((a) => a.userId) || [];
        const cached = employeesForManager['all'];
        if (cached) return cached.filter((emp) => !assignedUserIds.includes(emp.id));
        fetchAllEmployees();
        return [];
    };

    const getFilteredClients = () => {
        let filtered = clients;
        if (searchTerm) {
            filtered = filtered.filter((client) =>
                client.name.toLowerCase().includes(searchTerm.toLowerCase())
            );
        }
        if (filterStatus !== "all") {
            filtered = filtered.filter((client) =>
                filterStatus === "active" ? client.isActive : !client.isActive
            );
        }
        return filtered;
    };

    const filteredClients = getFilteredClients();
    const totalPages = Math.ceil(filteredClients.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const currentClients = filteredClients.slice(startIndex, endIndex);

    // Users who can assign clients are those with Clients.Update permission or team management
    const canAssignClients = canEditClients() || canManageTeam();

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">Loading...</div>
        );
    }

    return (
        <div className="container mx-auto px-4 pb-8 transition-all duration-300">
            {/* VIEW 1: CLIENTS LIST */}
            {view === "clients" && (
                <div className="animate-fade-in">
                    <div className="mb-8">
                        <h1 className="text-3xl font-bold text-gray-900">Clients</h1>
                        <p className="text-gray-500 mt-2 text-sm">
                            View and manage client assignments
                        </p>
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                        <div className="bg-white rounded-lg border border-gray-200 p-4">
                            <div className="text-sm text-gray-600">Total Clients</div>
                            <div className="text-2xl font-bold text-gray-900 mt-1">
                                {filteredClients.length}
                            </div>
                        </div>
                        <div className="bg-white rounded-lg border border-gray-200 p-4">
                            <div className="text-sm text-gray-600">Active</div>
                            <div className="text-2xl font-bold text-green-600 mt-1">
                                {filteredClients.filter((c) => c.isActive).length}
                            </div>
                        </div>
                        <div className="bg-white rounded-lg border border-gray-200 p-4">
                            <div className="text-sm text-gray-600">Inactive</div>
                            <div className="text-2xl font-bold text-gray-400 mt-1">
                                {filteredClients.filter((c) => !c.isActive).length}
                            </div>
                        </div>
                    </div>

                    {/* Filters */}
                    <div className="bg-white rounded-lg shadow-md p-4 mb-6">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="md:col-span-2">
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Search
                                </label>
                                <input
                                    type="text"
                                    placeholder="Search by name..."
                                    value={searchTerm}
                                    onChange={(e) => {
                                        setSearchTerm(e.target.value);
                                        setCurrentPage(1);
                                    }}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Status
                                </label>
                                <select
                                    value={filterStatus}
                                    onChange={(e) => {
                                        setFilterStatus(e.target.value);
                                        setCurrentPage(1);
                                    }}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                >
                                    <option value="all">All Clients</option>
                                    <option value="active">Active Only</option>
                                    <option value="inactive">Inactive Only</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Clients Table */}
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                                        Client
                                    </th>
                                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                                        Assigned
                                    </th>
                                    <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">
                                        Status
                                    </th>
                                    <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">
                                        Actions
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {currentClients.map((client) => (
                                    <tr
                                        key={client.uniqueId}
                                        onClick={() => openServiceSelection(client)}
                                        className="hover:bg-gray-50 cursor-pointer transition-colors"
                                    >
                                        {/* Client Name + Avatar */}
                                        <td className="px-4 py-3 flex items-center gap-3">
                                            <div className="h-10 w-10 bg-blue-100 rounded-full flex items-center justify-center">
                                                <span className="text-blue-600 font-semibold">
                                                    {client.name.charAt(0).toUpperCase()}
                                                </span>
                                            </div>
                                            <span className="text-gray-900 font-medium">
                                                {client.name}
                                            </span>
                                        </td>

                                        {/* Assigned */}
                                        <td className="px-4 py-3 text-gray-600 text-sm">
                                            {client.assignments && client.assignments.length > 0 ? (
                                                <div className="flex flex-col gap-1">
                                                    {client.assignments
                                                        .slice()
                                                        .sort((x, y) => {
                                                            // Sort by isTeamManager: managers first, then employees
                                                            const isManagerX = x.user?.customRole?.fullAccess || x.user?.customRole?.isTeamManager || ['superadmin', 'admin', 'manager'].includes(x.user?.role);
                                                            const isManagerY = y.user?.customRole?.fullAccess || y.user?.customRole?.isTeamManager || ['superadmin', 'admin', 'manager'].includes(y.user?.role);
                                                            return (isManagerX === isManagerY) ? 0 : isManagerX ? -1 : 1;
                                                        })
                                                        .map((a) => {
                                                            // Check if user is a team manager using customRole.isTeamManager or fullAccess
                                                            const isManager = a.user?.customRole?.fullAccess || a.user?.customRole?.isTeamManager || ['superadmin', 'admin', 'manager'].includes(a.user?.role);
                                                            const badgeClass = isManager
                                                                ? 'bg-purple-100 text-purple-800 border border-purple-200'
                                                                : 'bg-green-100 text-green-800 border border-green-200';
                                                            // Get actual role name: prefer customRole.name, fall back to role
                                                            const roleLabel = a.user?.customRole?.name || (a.user?.role ? a.user.role.charAt(0).toUpperCase() + a.user.role.slice(1) : 'Unknown');
                                                            return (
                                                                <div key={a.id || a.user?.id} className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                                                    <span className={`inline-flex items-center gap-2 px-2 py-1 rounded-md text-sm ${badgeClass}`}>
                                                                        <span className="font-medium">
                                                                            {((a.user?.name || a.userName || "Unknown") ?? "")
                                                                                .replace(/^\w/, c => c.toUpperCase())}
                                                                        </span>
                                                                        <span className="text-xs px-1.5 py-0.5 rounded bg-opacity-50">
                                                                            {roleLabel}
                                                                        </span>
                                                                    </span>
                                                                    {canAssignClients && !(user?.role === 'manager' && (a.user?.id || a.userId) === user.id) && (
                                                                        <button
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                // Use the assignment's own clientId (if available) when unassigning,
                                                                                // otherwise fall back to the merged client id
                                                                                handleUnassign(client.id, a.userId, a.clientId);
                                                                            }}
                                                                            title="Unassign"
                                                                            className="text-red-500 hover:text-red-700 px-1"
                                                                        >
                                                                            ×
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            );
                                                        })}
                                                </div>
                                            ) : (
                                                "-"
                                            )}
                                        </td>

                                        {/* Status */}
                                        <td className="px-4 py-3 text-center">
                                            <span className="flex items-center justify-center gap-2">
                                                <span
                                                    className={`w-3 h-3 rounded-full ${client.isActive ? "bg-green-500" : "bg-gray-400"
                                                        }`}
                                                ></span>

                                                <span className="text-sm font-medium">
                                                    {client.isActive ? "Active" : "Inactive"}
                                                </span>
                                            </span>
                                        </td>

                                        {/* Actions */}
                                        <td className="px-4 py-3 text-center">
                                            {canAssignClients && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        openAssignModal(client);
                                                    }}
                                                    className="px-3 py-1 bg-green-50 text-green-600 rounded-lg hover:bg-green-100"
                                                >
                                                    <svg
                                                        className="w-5 h-5"
                                                        fill="none"
                                                        stroke="currentColor"
                                                        viewBox="0 0 24 24"
                                                    >
                                                        <path
                                                            strokeLinecap="round"
                                                            strokeLinejoin="round"
                                                            strokeWidth="2"
                                                            d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
                                                        />
                                                    </svg>
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="mt-6 flex justify-center gap-2">
                            <button
                                onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                                disabled={currentPage === 1}
                                className="px-4 py-2 border rounded-lg hover:bg-gray-50 disabled:opacity-50"
                            >
                                Previous
                            </button>
                            {[...Array(totalPages)].map((_, idx) => (
                                <button
                                    key={idx + 1}
                                    onClick={() => setCurrentPage(idx + 1)}
                                    className={`px-4 py-2 rounded-lg ${currentPage === idx + 1
                                        ? "bg-blue-600 text-white"
                                        : "border hover:bg-gray-50"
                                        }`}
                                >
                                    {idx + 1}
                                </button>
                            ))}
                            <button
                                onClick={() =>
                                    setCurrentPage((prev) => Math.min(prev + 1, totalPages))
                                }
                                disabled={currentPage === totalPages}
                                className="px-4 py-2 border rounded-lg hover:bg-gray-50 disabled:opacity-50"
                            >
                                Next
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* VIEW 2: SERVICE SELECTION (TABLE/ROW STYLE) */}
            {view === 'services' && selectedClient && (
                <ClientServicesSection
                    selectedClient={selectedClient}
                    goBackToClients={goBackToClients}
                    openMauticCampaigns={openMauticCampaigns}
                    openDropcowboyCampaigns={openDropcowboyCampaigns}
                    openSmsCampaigns={openSmsCampaigns}
                />
            )}

            {/* VIEW 3: MAUTIC CAMPAIGNS LIST */}
            {view === 'campaigns' && selectedClient && (
                <MauticCampaignsSection
                    campaigns={campaigns}
                    selectedClient={selectedClient}
                    loadingCampaigns={loadingCampaigns}
                    goBackToServices={goBackToServices}
                    openCampaignDetails={openCampaignDetails}
                />
            )}

            {/* VIEW 4: CAMPAIGN DETAILS */}
            {view === 'details' && selectedClient && selectedCampaign && (
                <MauticEmailsSection
                    campaigns={campaigns}
                    selectedCampaign={selectedCampaign}
                    setSelectedCampaign={setSelectedCampaign}
                    goBackToCampaigns={goBackToCampaigns}
                />
            )}

            {/* VIEW 5: DROPCOWBOY CAMPAIGNS LIST */}
            {view === "dropcowboy" && selectedClient && (
                <div className="animate-fade-in">
                    <button
                        onClick={goBackToServices}
                        className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6"
                    >
                        <ArrowLeft className="w-5 h-5" />
                        <span className="font-medium">Back to {selectedClient.name} Services</span>
                    </button>

                    <h2 className="text-xl font-semibold mb-4">
                        {selectedClient.name} — Ringless Voicemail Dashboard
                    </h2>

                    <ClientsDropCowboyDashboard clientName={selectedClient.name} />
                </div>
            )}

            {/* VIEW 6: SMS CAMPAIGNS LIST */}
            {view === "sms" && selectedClient && (
                <MauticSmsSection
                    selectedClient={selectedClient}
                    goBackToServices={goBackToServices}
                    goBackToClients={goBackToClients}
                />
            )}

            {/* Assign Modal */}
            {showAssignModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-lg max-w-md w-full p-6">
                        <h2 className="text-2xl font-bold mb-4">Assign Client</h2>
                        <p className="text-gray-600 mb-4">
                            Assign <strong>{selectedClientForAssign?.name}</strong> to:
                        </p>
                        <form onSubmit={handleAssign} className="space-y-4">
                            {(["superadmin", "admin", "manager"].includes(user?.role)) && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Manager
                                    </label>
                                    {assignData.managerId ? (
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className="inline-flex items-center gap-2 bg-purple-100 text-purple-800 px-3 py-2 rounded-lg border border-purple-200">
                                                <span className="text-xs font-semibold bg-purple-600 text-white px-1.5 py-0.5 rounded">Manager</span>
                                                <span className="font-medium">
                                                    {((managers.find(m => m.id === parseInt(assignData.managerId))?.name || 'Selected')
                                                        .replace(/\b\w/g, c => c.toUpperCase()))}
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() => setAssignData({ ...assignData, managerId: "" })}
                                                    className="text-purple-600 hover:text-purple-800 ml-1"
                                                >
                                                    ✕
                                                </button>
                                            </span>
                                        </div>
                                    ) : (
                                        <select
                                            value={assignData.managerId}
                                            onChange={(e) => {
                                                const mid = e.target.value;
                                                setAssignData({ ...assignData, managerId: mid });
                                                if (mid) fetchEmployeesForManager(parseInt(mid));
                                            }}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                        >
                                            <option value="">(Optional) Select Manager</option>
                                            {getManagers().map((manager) => (
                                                <option key={manager.id} value={manager.id}>
                                                    {(manager.name ?? "Unknown").replace(/\b\w/g, c => c.toUpperCase())} ({manager.email})
                                                </option>
                                            ))}
                                        </select>
                                    )}
                                </div>
                            )}

                            {(assignData.managerId || user?.role === 'superadmin' || user?.role === 'admin') && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Employee(s)
                                    </label>
                                    {/* Selected employees as chips */}
                                    <div className="flex flex-wrap gap-2 mb-2">
                                        {(assignData.userIds || []).map((uid) => {
                                            const allCandidates = (assignData.managerId
                                                ? employeesForManager[assignData.managerId] || []
                                                : employeesForManager['all'] || []);
                                            const emp = allCandidates.find((e) => e.id === uid) || { id: uid, name: `User ${uid}` };
                                            return (
                                                <span key={uid} className="inline-flex items-center gap-2 bg-blue-50 text-blue-800 px-3 py-2 rounded-lg border border-blue-200">
                                                    <span className="text-xs font-semibold bg-blue-600 text-white px-1.5 py-0.5 rounded">Employee</span>
                                                    <span className="font-medium">{(emp.name ?? "Unknown").replace(/\b\w/g, c => c.toUpperCase())}</span>
                                                    <button type="button" onClick={() => setAssignData({ ...assignData, userIds: assignData.userIds.filter(i => i !== uid) })} className="text-blue-600 hover:text-blue-800 ml-1">✕</button>
                                                </span>
                                            );
                                        })}
                                    </div>
                                    <select
                                        defaultValue=""
                                        onChange={(e) => {
                                            const val = e.target.value ? parseInt(e.target.value, 10) : null;
                                            if (!val) return;
                                            if (!assignData.userIds.includes(val)) {
                                                setAssignData({ ...assignData, userIds: [...assignData.userIds, val] });
                                            }
                                            // reset selection
                                            e.target.value = '';
                                        }}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                    >
                                        <option value="">Add employee...</option>
                                        {(assignData.managerId
                                            ? getEmployeesUnderManager(assignData.managerId)
                                            : getEmployeesForSuperadminOrAdmin()
                                        ).map((emp) => (
                                            <option key={emp.id} value={emp.id}>
                                                {(emp.name ?? "Unknown").replace(/\b\w/g, c => c.toUpperCase())} ({emp.email})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}
                            <div className="flex justify-end gap-2 pt-4">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowAssignModal(false);
                                        setSelectedClientForAssign(null);
                                        setAssignData({ managerId: "", userIds: [] });
                                    }}
                                    className="px-4 py-2 border rounded-lg hover:bg-gray-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={!(assignData.userIds?.length > 0 || assignData.managerId)}
                                    className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50"
                                >
                                    Assign
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Clients;