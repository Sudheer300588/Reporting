import { useState, useEffect } from 'react';
import { ArrowLeft, MessageSquare, Eye, Activity, TrendingUp, CheckCircle, XCircle, Clock, User, MessageCircle } from 'lucide-react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { useMauticStore } from "../../zustand/useMauticStore";

const SmsClientsView = () => {
    const [view, setView] = useState('list'); // list, campaigns, messages, activity
    const [smsClients, setSmsClients] = useState([]);
    const [selectedClient, setSelectedClient] = useState(null);
    const [smsCampaigns, setSmsCampaigns] = useState([]);
    const [selectedCampaign, setSelectedCampaign] = useState(null);
    const [messages, setMessages] = useState([]);
    const [selectedLead, setSelectedLead] = useState(null);
    const [loading, setLoading] = useState(true);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalRecords, setTotalRecords] = useState(0);
    const [pageInput, setPageInput] = useState('1');
    const [itemsPerPage, setItemsPerPage] = useState(10);
    const [overallDelivered, setOverallDelivered] = useState(0);
    const [overallFailed, setOverallFailed] = useState(0);
    const { contactCache, setContactData } = useMauticStore();
    const [contact, setContact] = useState(null);
    const [contactLoading, setContactLoading] = useState(true);

    useEffect(() => {
        fetchSmsClients();
    }, []);

    const fetchSmsClients = async () => {
        try {
            setLoading(true);
            const baseUrl = import.meta.env.VITE_API_URL || '';
            const response = await axios.get(`${baseUrl}/api/mautic/sms-clients`);
            setSmsClients(response.data.data || []);
        } catch (error) {
            console.error('Error fetching SMS clients:', error);
            toast.error('Failed to fetch SMS clients');
        } finally {
            setLoading(false);
        }
    };

    const openSmsClientCampaigns = async (client) => {
        try {
            setSelectedClient(client);
            setView('campaigns');
            setLoading(true);
            const baseUrl = import.meta.env.VITE_API_URL || '';
            const response = await axios.get(`${baseUrl}/api/mautic/sms-clients/${client.id}/campaigns`);
            setSmsCampaigns(response.data.data || []);
        } catch (error) {
            console.error('Error fetching campaigns:', error);
            toast.error('Failed to fetch campaigns');
        } finally {
            setLoading(false);
        }
    };

    const openCampaignMessages = async (campaign, page = 1) => {
        try {
            setLoading(true);
            const baseUrl = import.meta.env.VITE_API_URL || '';
            const response = await axios.get(
                `${baseUrl}/api/mautic/sms-campaigns/${campaign.mauticId}/messages?page=${page}&limit=${itemsPerPage}`
            );
            // Update all state after data is loaded
            setSelectedCampaign(campaign);
            setCurrentPage(page);
            setMessages(response.data.data || []);
            setTotalRecords(response.data.total || 0);
            setTotalPages(Math.ceil((response.data.total || 0) / itemsPerPage));
            // Store overall stats if provided by API, otherwise use campaign data
            setOverallDelivered(response.data.delivered || campaign.deliveredCount || 0);
            setOverallFailed(response.data.failed || campaign.failedCount || 0);
            // Change view only after all data is ready
            setView('messages');
        } catch (error) {
            console.error('Error fetching messages:', error);
            toast.error('Failed to fetch messages');
        } finally {
            setLoading(false);
        }
    };

    const goToPage = (page) => {
        if (page >= 1 && page <= totalPages) {
            openCampaignMessages(selectedCampaign, page);
            setPageInput(page.toString());
        }
    };

    const handlePageInputSubmit = (e) => {
        e.preventDefault();
        const page = parseInt(pageInput);
        if (!isNaN(page)) {
            goToPage(page);
        }
    };

    const handleItemsPerPageChange = async (newItemsPerPage) => {
        if (selectedCampaign) {
            setItemsPerPage(newItemsPerPage);
            setCurrentPage(1);
            setPageInput('1');
            // Immediately fetch with new limit
            try {
                setLoading(true);
                const baseUrl = import.meta.env.VITE_API_URL || '';
                const response = await axios.get(
                    `${baseUrl}/api/mautic/sms-campaigns/${selectedCampaign.mauticId}/messages?page=1&limit=${newItemsPerPage}`
                );
                setMessages(response.data.data || []);
                setTotalRecords(response.data.total || 0);
                setTotalPages(Math.ceil((response.data.total || 0) / newItemsPerPage));
                setOverallDelivered(response.data.delivered || selectedCampaign.deliveredCount || 0);
                setOverallFailed(response.data.failed || selectedCampaign.failedCount || 0);
            } catch (error) {
                console.error('Error fetching messages:', error);
                toast.error('Failed to fetch messages');
            } finally {
                setLoading(false);
            }
        }
    };

    const openLeadActivity = async (leadId) => {
        try {
            setView("activity");
            setContactLoading(true);

            const key = `${leadId}-${selectedCampaign.mauticId}`;
            const cached = contactCache[key];
            if (cached) {
                setContact(cached);
                setView("activity");
                setContactLoading(false);
                return;
            }

            const baseUrl = import.meta.env.VITE_API_URL || '';
            const response = await axios.get(`${baseUrl}/api/mautic/contact/${leadId}`, {
                params: { smsId: selectedCampaign.mauticId },
            });

            setContactData(leadId, selectedCampaign.mauticId, response.data);
            setContact(response.data);
            setView("activity");
        } catch (error) {
            console.error("Error fetching contact activity:", error);
            toast.error("Failed to fetch contact activity");
        } finally {
            setContactLoading(false);
        }
    };

    const goBackToClients = () => {
        setView('list');
        setSelectedClient(null);
        setSmsCampaigns([]);
    };

    const goBackToCampaigns = () => {
        setView('campaigns');
        setSelectedCampaign(null);
        setMessages([]);
        setCurrentPage(1);
        setPageInput('1');
    };

    const goBackToMessages = () => {
        setView('messages');
        setSelectedLead(null);
    };

    if (loading && view === 'list') {
        return (
            <div className="flex justify-center items-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    // VIEW 1: SMS CLIENTS LIST
    if (view === 'list') {
        return (
            <div className="animate-fade-in px-6">
                <h1 className="text-3xl font-bold text-gray-900 mb-8">📱 SMS Clients</h1>

                <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                        <h3 className="text-lg font-semibold text-gray-900">SMS Clients List</h3>
                        <p className="text-sm text-gray-500 mt-1">SMS campaigns without Mautic client prefix</p>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-gray-50 border-b border-gray-200">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Mautic URL</th>
                                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">SMS Count</th>
                                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {smsClients.length === 0 ? (
                                    <tr>
                                        <td colSpan="5" className="px-6 py-12 text-center">
                                            <MessageSquare className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                                            <p className="text-gray-500 font-medium">No SMS clients found</p>
                                        </td>
                                    </tr>
                                ) : (
                                    smsClients.map((client) => (
                                        <tr
                                            key={client.id}
                                            onClick={() => openSmsClientCampaigns(client)}
                                            className="hover:bg-gray-50 cursor-pointer transition-colors"
                                        >
                                            <td className="px-6 py-4">
                                                <div className="flex items-center">
                                                    <MessageSquare className="w-5 h-5 text-purple-500 mr-3" />
                                                    <span className="font-medium text-gray-900">{client.name}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <a
                                                    href={client.mauticUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-blue-600 hover:text-blue-800 text-sm"
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    {client.mauticUrl}
                                                </a>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <span className="text-sm font-semibold text-gray-900">
                                                    {client.smsCount || client.smsCampaignsCount || 0}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${client.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                                                    }`}>
                                                    {client.isActive ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                                                    {client.isActive ? 'Active' : 'Inactive'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <div className="inline-flex items-center gap-1 text-blue-600 text-sm font-medium">
                                                    <Eye className="w-4 h-4" />
                                                    View Campaigns
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        );
    }

    // VIEW 2: SMS CAMPAIGNS
    if (view === 'campaigns') {
        const totalCampaigns = smsCampaigns.length;
        const totalSent = smsCampaigns.reduce((sum, sms) => sum + (sms.sentCount || 0), 0);
        const avgSentPerCampaign = totalCampaigns > 0 ? Math.round(totalSent / totalCampaigns) : 0;
        const activeCampaigns = smsCampaigns.filter(sms => (sms.sentCount || 0) > 0).length;

        return (
            <div className="animate-fade-in px-6">
                <button
                    onClick={goBackToClients}
                    className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6"
                >
                    <ArrowLeft className="w-5 h-5" />
                    <span className="font-medium">Back to SMS Clients</span>
                </button>

                <h2 className="text-2xl font-bold text-gray-900 mb-6">
                    📱 {selectedClient.name} - SMS Campaigns
                </h2>

                {/* Metric Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                    <div className="bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 rounded-lg p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-blue-600 mb-1">Total Campaigns</p>
                                <p className="text-3xl font-bold text-blue-900">{totalCampaigns}</p>
                            </div>
                            <MessageSquare className="w-10 h-10 text-blue-500 opacity-50" />
                        </div>
                    </div>

                    <div className="bg-gradient-to-br from-green-50 to-green-100 border border-green-200 rounded-lg p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-green-600 mb-1">Total Sent</p>
                                <p className="text-3xl font-bold text-green-900">{totalSent.toLocaleString()}</p>
                            </div>
                            <TrendingUp className="w-10 h-10 text-green-500 opacity-50" />
                        </div>
                    </div>

                    <div className="bg-gradient-to-br from-purple-50 to-purple-100 border border-purple-200 rounded-lg p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-purple-600 mb-1">Avg per Campaign</p>
                                <p className="text-3xl font-bold text-purple-900">{avgSentPerCampaign.toLocaleString()}</p>
                            </div>
                            <Activity className="w-10 h-10 text-purple-500 opacity-50" />
                        </div>
                    </div>

                    <div className="bg-gradient-to-br from-amber-50 to-amber-100 border border-amber-200 rounded-lg p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-amber-600 mb-1">Active Campaigns</p>
                                <p className="text-3xl font-bold text-amber-900">{activeCampaigns}</p>
                            </div>
                            <CheckCircle className="w-10 h-10 text-amber-500 opacity-50" />
                        </div>
                    </div>
                </div>

                {/* Campaigns Table */}
                <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                        <h3 className="text-lg font-semibold text-gray-900">SMS Campaigns</h3>
                    </div>

                    {loading ? (
                        <div className="flex justify-center items-center h-64">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-gray-50 border-b border-gray-200">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Sent</th>
                                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {smsCampaigns.map((sms) => (
                                        <tr
                                            key={sms.id}
                                            onClick={() => openCampaignMessages(sms)}
                                            className="hover:bg-gray-50 cursor-pointer transition-colors"
                                        >
                                            <td className="px-6 py-4">
                                                <div className="flex items-center">
                                                    <MessageSquare className="w-5 h-5 text-blue-500 mr-3" />
                                                    <span className="text-sm font-medium text-gray-900">{sms.name}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                                                    {sms.category?.title || sms.category?.alias || 'SMS'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <span className="text-sm font-semibold text-gray-900">
                                                    {(sms.sentCount || 0).toLocaleString()}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                {(sms.sentCount || 0) > 0 ? (
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                                        <CheckCircle className="w-3 h-3" />
                                                        Active
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                                                        <XCircle className="w-3 h-3" />
                                                        Not Sent
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // VIEW 3: SMS MESSAGES WITH PAGINATION
    if (view === 'messages') {
        return (
            <div className="animate-fade-in px-6">
                <button
                    onClick={goBackToCampaigns}
                    className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6"
                >
                    <ArrowLeft className="w-5 h-5" />
                    <span className="font-medium">Back to Campaigns</span>
                </button>

                <h2 className="text-2xl font-bold text-gray-900 mb-2">
                    {selectedCampaign.name}
                </h2>
                <p className="text-sm text-gray-600 mb-6">Messages for SMS ID #{selectedCampaign.mauticId}</p>

                {/* Metric Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                    <div className="bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 rounded-lg p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-blue-600 mb-1">Total Sent</p>
                                <p className="text-3xl font-bold text-blue-900">{totalRecords.toLocaleString()}</p>
                            </div>
                            <TrendingUp className="w-10 h-10 text-blue-500 opacity-50" />
                        </div>
                    </div>

                    <div className="bg-gradient-to-br from-green-50 to-green-100 border border-green-200 rounded-lg p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-green-600 mb-1">Delivered</p>
                                <p className="text-3xl font-bold text-green-900">{overallDelivered.toLocaleString()}</p>
                            </div>
                            <CheckCircle className="w-10 h-10 text-green-500 opacity-50" />
                        </div>
                    </div>

                    <div className="bg-gradient-to-br from-red-50 to-red-100 border border-red-200 rounded-lg p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-red-600 mb-1">Failed</p>
                                <p className="text-3xl font-bold text-red-900">{overallFailed.toLocaleString()}</p>
                            </div>
                            <XCircle className="w-10 h-10 text-red-500 opacity-50" />
                        </div>
                    </div>
                </div>

                {/* Messages Table */}
                <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center flex-wrap gap-4">
                        <div>
                            <h3 className="text-lg font-semibold text-gray-900">SMS Messages</h3>
                            <p className="text-sm text-gray-500">
                                Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, totalRecords)} of {totalRecords.toLocaleString()} records
                            </p>
                        </div>

                        <div className="flex items-center gap-4">
                            {/* Per Page Selector */}
                            <div className="flex items-center gap-2">
                                <span className="text-sm text-gray-600">Per page:</span>
                                <select
                                    value={itemsPerPage}
                                    onChange={(e) => handleItemsPerPageChange(parseInt(e.target.value))}
                                    className="px-3 py-1 border border-gray-300 rounded-lg text-sm"
                                >
                                    <option value={5}>5</option>
                                    <option value={10}>10</option>
                                    <option value={20}>20</option>
                                </select>
                            </div>

                            {/* Page Jump */}
                            <form onSubmit={handlePageInputSubmit} className="flex items-center gap-2">
                                <span className="text-sm text-gray-600">Jump to:</span>
                                <input
                                    type="number"
                                    min="1"
                                    max={totalPages}
                                    value={pageInput}
                                    onChange={(e) => setPageInput(e.target.value)}
                                    className="w-20 px-3 py-1 border border-gray-300 rounded-lg text-sm"
                                />
                                <button
                                    type="submit"
                                    className="px-4 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
                                >
                                    Go
                                </button>
                            </form>
                        </div>
                    </div>

                    {loading ? (
                        <div className="flex justify-center items-center py-12">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                        </div>
                    ) : messages.length === 0 ? (
                        <div className="px-6 py-12 text-center">
                            <MessageSquare className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                            <p className="text-gray-500 font-medium">No messages found</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-gray-50 border-b border-gray-200">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Lead ID</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date Sent</th>
                                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {messages.map((msg, idx) => (
                                        <tr key={idx} className="hover:bg-gray-50 transition-colors">
                                            <td className="px-6 py-4">
                                                <span className="text-sm font-medium text-gray-900">{msg.leadId}</span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="text-sm text-gray-600">{msg.dateSent}</span>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${msg.status === 'delivered' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                                    }`}>
                                                    {msg.status === 'delivered' ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                                                    {msg.status === 'delivered' ? 'Delivered' : 'Failed'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <button
                                                    onClick={() => openLeadActivity(msg.leadId)}
                                                    className="inline-flex items-center gap-1 px-3 py-1 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 text-xs font-medium transition-colors"
                                                >
                                                    <Activity className="w-3 h-3" />
                                                    View Activity
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Pagination Controls */}
                    <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-between items-center">
                        <button
                            onClick={() => goToPage(currentPage - 1)}
                            disabled={currentPage === 1}
                            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                        >
                            Previous
                        </button>

                        <span className="text-sm text-gray-700">
                            Page <span className="font-semibold">{currentPage}</span> of <span className="font-semibold">{totalPages}</span>
                        </span>

                        <button
                            onClick={() => goToPage(currentPage + 1)}
                            disabled={currentPage === totalPages}
                            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                        >
                            Next
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // VIEW 4: LEAD ACTIVITY
    if (view === "activity") {
        if (contactLoading) {
            return (
                <div className="flex justify-center items-center h-64">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                </div>
            );
        }

        if (!contact) {
            return (
                <div className="p-8 text-center text-red-500 font-medium">
                    No contact found for this lead.
                </div>
            );
        }

        const events = contact.events || [];

        const smsEvents = events.filter((e) => e.event === "sms.sent");
        const repliedEvents = events.filter((e) => e.event === "sms_reply");

        return (
            <div className="animate-fade-in px-6">
                <button
                    onClick={goBackToMessages}
                    className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6"
                >
                    <ArrowLeft className="w-5 h-5" />
                    <span className="font-medium">Back to Messages</span>
                </button>

                <div className="mb-6">
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">
                        Lead Activity - {contact.name || `#${selectedLead}`}
                    </h2>
                    <p className="text-sm text-gray-600">
                        Campaign: {selectedCampaign.name}
                    </p>
                </div>

                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                    <div className="bg-gradient-to-br from-purple-50 to-purple-100 border border-purple-200 rounded-lg p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-purple-600 mb-1">Total Events</p>
                                <p className="text-3xl font-bold text-purple-900">{events.length}</p>
                            </div>
                            <Activity className="w-10 h-10 text-purple-500 opacity-50" />
                        </div>
                    </div>

                    <div className="bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 rounded-lg p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-blue-600 mb-1">SMS Sent</p>
                                <p className="text-3xl font-bold text-blue-900">{smsEvents.length}</p>
                            </div>
                            <MessageSquare className="w-10 h-10 text-blue-500 opacity-50" />
                        </div>
                    </div>

                    <div className="bg-gradient-to-br from-green-50 to-green-100 border border-green-200 rounded-lg p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-green-600 mb-1">Replies</p>
                                <p className="text-3xl font-bold text-green-900">{repliedEvents.length}</p>
                            </div>
                            <MessageCircle className="w-10 h-10 text-green-500 opacity-50" />
                        </div>
                    </div>
                </div>

                {/* Events Timeline */}
                <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                        <h3 className="text-lg font-semibold text-gray-900">Activity Timeline</h3>
                        <p className="text-sm text-gray-500 mt-1">
                            Showing all {events.length} events
                        </p>
                    </div>

                    {events.length === 0 ? (
                        <div className="px-6 py-12 text-center">
                            <Activity className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                            <p className="text-gray-500 font-medium">
                                No activity found for this contact
                            </p>
                        </div>
                    ) : (
                        <div className="px-6 py-4 space-y-4">
                            {events.map((event, idx) => {
                                const isSmsSent = event.event === "sms.sent";
                                const isReply = event.event === "sms_reply";

                                return (
                                    <div
                                        key={idx}
                                        className={`flex gap-4 p-4 rounded-lg border ${isReply
                                            ? "bg-green-50 border-green-200"
                                            : isSmsSent
                                                ? "bg-blue-50 border-blue-200"
                                                : "bg-gray-50 border-gray-200"
                                            }`}
                                    >
                                        <div className="flex-shrink-0">
                                            {isReply ? (
                                                <MessageCircle className="w-6 h-6 text-green-600" />
                                            ) : isSmsSent ? (
                                                <MessageSquare className="w-6 h-6 text-blue-600" />
                                            ) : (
                                                <Activity className="w-6 h-6 text-gray-600" />
                                            )}
                                        </div>
                                        <div className="flex-1">
                                            <p className="text-sm font-medium text-gray-900">
                                                {event.event === "sms.sent" ? "SMS Sent" : event.event === "sms_reply" ? "SMS Reply" : "Unknown Event"}
                                            </p>
                                            {event.event === "sms.sent" &&
                                                <pre className="mt-2 text-xs text-gray-600 bg-white rounded p-2 border border-gray-200 whitespace-pre-wrap break-words">
                                                    {JSON.stringify(event.details?.stat?.message, null, 2)}
                                                </pre>
                                            }
                                            {event.event === "sms_reply" &&
                                                <pre className="mt-2 text-xs text-gray-600 bg-white rounded p-2 border border-gray-200 whitespace-pre-wrap break-words">
                                                    {JSON.stringify(event.details?.message, null, 2)}
                                                </pre>
                                            }
                                            <div className="text-xs text-gray-500 mt-2">
                                                <Clock className="inline w-3 h-3 mr-1" />
                                                {new Date(event.timestamp).toLocaleString()}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    return null;
};

export default SmsClientsView;
