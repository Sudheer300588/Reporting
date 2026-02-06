import { useState, useEffect } from "react";
import { MessageSquare, ArrowLeft, Activity, TrendingUp, CheckCircle, XCircle, Eye, Clock, User, MessageCircle } from "lucide-react";
import axios from "axios";

const MauticSmsSection = ({ selectedClient, goBackToServices, goBackToClients }) => {
    const [view, setView] = useState('list'); // 'list', 'messages', or 'activity'
    const [smsCampaigns, setSmsCampaigns] = useState([]);
    const [selectedCampaign, setSelectedCampaign] = useState(null);
    const [messages, setMessages] = useState([]);
    const [selectedLead, setSelectedLead] = useState(null);
    const [leadActivity, setLeadActivity] = useState([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalRecords, setTotalRecords] = useState(0);
    const [pageInput, setPageInput] = useState('1');
    const [itemsPerPage, setItemsPerPage] = useState(10);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [overallDelivered, setOverallDelivered] = useState(0);
    const [overallFailed, setOverallFailed] = useState(0);

    // For SMS-only clients, back button should go to clients list to avoid redirect loop
    const isSmsOnlyClient = selectedClient?.reportId === 'sms-only';
    const handleBack = isSmsOnlyClient ? goBackToClients : goBackToServices;
    const backButtonText = isSmsOnlyClient ? 'Back to Clients' : `Back to ${selectedClient?.name} Services`;

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
            setError(null);
            // Change view only after all data is ready
            setView('messages');
        } catch (error) {
            console.error('Error fetching messages:', error);
            setError('Failed to fetch messages');
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
        if (selectedCampaign && view === 'messages') {
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
                setError(null);
            } catch (error) {
                console.error('Error fetching messages:', error);
                setError('Failed to fetch messages');
            } finally {
                setLoading(false);
            }
        }
    };

    const openLeadActivity = async (leadId) => {
        try {
            setView("activity"); // immediate transition for responsiveness
            setLoading(true);

            const baseUrl = import.meta.env.VITE_API_URL || '';
            const response = await axios.get(
                `${baseUrl}/api/mautic/contact/${leadId}`,
                { params: { smsId: selectedCampaign.mauticId } }
            );

            // Update states once data arrives
            setSelectedLead(leadId);
            setLeadActivity(response.data.events || []);
            
            setError(null);
        } catch (error) {
            console.error("Error fetching lead activity:", error);
            setError("Failed to fetch lead activity");
        } finally {
            setLoading(false);
        }
    };

    const goBackToCampaigns = () => {
        setView('list');
        setSelectedCampaign(null);
        setMessages([]);
        setCurrentPage(1);
        setPageInput('1');
        setError(null);
    };

    const goBackToMessages = () => {
        setView('messages');
        setSelectedLead(null);
        setLeadActivity([]);
        setError(null);
    };

    useEffect(() => {
        if (!selectedClient?.mauticApiId) return;

        const fetchSmsCampaigns = async () => {
            try {
                setLoading(true);
                setError(null);
                const baseUrl = import.meta.env.VITE_API_URL || "";
                const response = await axios.get(`${baseUrl}/api/mautic/clients/${selectedClient.mauticApiId}/sms`);
                setSmsCampaigns(response.data.data || []);
            } catch (err) {
                console.error('Error fetching SMS campaigns:', err);
                setError(err.message || 'Failed to load SMS campaigns');
            } finally {
                setLoading(false);
            }
        };

        fetchSmsCampaigns();
    }, [selectedClient?.mauticApiId]);

    // Calculate metrics
    const totalCampaigns = smsCampaigns.length;
    const totalSent = smsCampaigns.reduce((sum, sms) => sum + (sms.sentCount || 0), 0);
    const avgSentPerCampaign = totalCampaigns > 0 ? Math.round(totalSent / totalCampaigns) : 0;
    const activeCampaigns = smsCampaigns.filter(sms => (sms.sentCount || 0) > 0).length;

    // VIEW: MESSAGES
    if (view === 'messages') {
        return (
            <div className="animate-fade-in">
                <button
                    onClick={goBackToCampaigns}
                    className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6"
                >
                    <ArrowLeft className="w-5 h-5" />
                    <span className="font-medium">Back to SMS Campaigns</span>
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
                        <div className="flex justify-center items-center h-64">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
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

    // VIEW 3: LEAD ACTIVITY
    if (view === 'activity') {
        const smsEvents = leadActivity.filter(e => e.event && e.event.includes('sms'));
        const repliedEvents = leadActivity.filter(e => e.event === 'sms.replied');

        return (
            <div className="animate-fade-in">
                <button
                    onClick={goBackToMessages}
                    className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6"
                >
                    <ArrowLeft className="w-5 h-5" />
                    <span className="font-medium">Back to Messages</span>
                </button>

                <div className="mb-6">
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">
                        Lead Activity - ID #{selectedLead}
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
                                <p className="text-3xl font-bold text-purple-900">{leadActivity.length}</p>
                            </div>
                            <Activity className="w-10 h-10 text-purple-500 opacity-50" />
                        </div>
                    </div>

                    <div className="bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 rounded-lg p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-blue-600 mb-1">SMS Events</p>
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

                {/* Activity Timeline */}
                <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                        <h3 className="text-lg font-semibold text-gray-900">Activity Timeline</h3>
                        <p className="text-sm text-gray-500 mt-1">
                            Showing all {leadActivity.length} events
                        </p>
                    </div>

                    {loading ? (
                        <div className="flex justify-center items-center py-12">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                        </div>
                    ) : leadActivity.length === 0 ? (
                        <div className="px-6 py-12 text-center">
                            <Activity className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                            <p className="text-gray-500 font-medium">No activity found for this lead</p>
                        </div>
                    ) : (
                        <div className="px-6 py-4">
                            <div className="space-y-4">
                                {leadActivity.map((event, idx) => {
                                    const isSmsEvent = event.event && event.event.includes('sms.sent');
                                    const isReply = event.event === 'sms_reply';

                                    return (
                                        <div
                                            key={idx}
                                            className={`flex gap-4 p-4 rounded-lg border ${isReply
                                                ? 'bg-green-50 border-green-200'
                                                : isSmsEvent
                                                    ? 'bg-blue-50 border-blue-200'
                                                    : 'bg-gray-50 border-gray-200'
                                                }`}
                                        >
                                            <div className="flex-shrink-0">
                                                {isReply ? (
                                                    <MessageCircle className="w-6 h-6 text-green-600" />
                                                ) : isSmsEvent ? (
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
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // VIEW: CAMPAIGN LIST
    if (loading) {
        return (
            <div className="animate-fade-in">
                <button
                    onClick={handleBack}
                    className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6"
                >
                    <ArrowLeft className="w-5 h-5" />
                    <span className="font-medium">{backButtonText}</span>
                </button>
                <div className="flex justify-center items-center h-64">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="animate-fade-in">
                <button
                    onClick={handleBack}
                    className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6"
                >
                    <ArrowLeft className="w-5 h-5" />
                    <span className="font-medium">{backButtonText}</span>
                </button>
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
                    <p className="font-medium">Error loading SMS campaigns</p>
                    <p className="text-sm mt-1">{error}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="animate-fade-in">
            <button
                onClick={handleBack}
                className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6"
            >
                <ArrowLeft className="w-5 h-5" />
                <span className="font-medium">{backButtonText}</span>
            </button>

            <h2 className="text-2xl font-bold text-gray-900 mb-6">
                📱 SMS Campaigns
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

            {/* SMS Campaigns Table */}
            <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                    <h3 className="text-lg font-semibold text-gray-900">SMS Campaigns</h3>
                </div>

                {loading ? (
                    <div className="flex justify-center items-center h-64">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                    </div>
                ) : smsCampaigns.length === 0 ? (
                    <div className="px-6 py-12 text-center">
                        <MessageSquare className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                        <p className="text-gray-500 font-medium">No SMS campaigns found</p>
                        <p className="text-sm text-gray-400 mt-1">Create SMS campaigns in Mautic to see them here</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-gray-50 border-b border-gray-200">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Name
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Category
                                    </th>
                                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Sent
                                    </th>
                                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Status
                                    </th>
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
                                                <MessageSquare className="w-5 h-5 text-blue-500 mr-3 flex-shrink-0" />
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
};

export default MauticSmsSection;
