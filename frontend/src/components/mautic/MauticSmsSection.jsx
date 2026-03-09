import { useState, useEffect } from "react";
import { MessageSquare, ArrowLeft, Activity, TrendingUp, CheckCircle, XCircle, MessageCircle } from "lucide-react";
import axios from "axios";

const MauticSmsSection = ({ selectedClient, goBackToServices, goBackToClients }) => {
    const [view, setView] = useState('list'); // 'list', 'messages', or 'activity'
    const [smsCampaigns, setSmsCampaigns] = useState([]);
    const [selectedCampaign, setSelectedCampaign] = useState(null);
    const [messages, setMessages] = useState([]);
    const [selectedLead, setSelectedLead] = useState(null);
    const [leadActivity, setLeadActivity] = useState(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalRecords, setTotalRecords] = useState(0);
    const [pageInput, setPageInput] = useState('1');
    const [itemsPerPage, setItemsPerPage] = useState(100);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [overallDelivered, setOverallDelivered] = useState(0);
    const [overallFailed, setOverallFailed] = useState(0);
    const [overallReplied, setOverallReplied] = useState(0);
    const [replyFilter, setReplyFilter] = useState('all'); // 'all', 'Stop', 'Unsubscribe', 'Other'

    // For SMS-only clients, back button should go to clients list
    const isSmsOnlyClient = selectedClient?.reportId === 'sms-only';
    const handleBack = isSmsOnlyClient ? goBackToClients : goBackToServices;
    const backButtonText = isSmsOnlyClient ? 'Back to Clients' : `Back to ${selectedClient?.name} Services`;

    const baseUrl = import.meta.env.VITE_API_URL || '';

    // Fetch SMS campaigns for the selected client
    useEffect(() => {
        const fetchSmsCampaigns = async () => {
            try {
                setLoading(true);
                setError(null);

                // Determine the correct endpoint based on client type
                let endpoint;
                if (selectedClient?.smsClientId) {
                    // SMS-only client - use smsClientId
                    endpoint = `${baseUrl}/api/sms-clients/${selectedClient.smsClientId}/campaigns`;
                } else if (selectedClient?.id) {
                    // Regular Mautic client - use new endpoint that matches by URL
                    endpoint = `${baseUrl}/api/clients/${selectedClient.id}/sms-campaigns`;
                } else {
                    setError('No client ID available');
                    return;
                }

                const response = await axios.get(endpoint);
                setSmsCampaigns(response.data.data || []);
            } catch (err) {
                console.error('Error fetching SMS campaigns:', err);
                setError(err.message || 'Failed to load SMS campaigns');
            } finally {
                setLoading(false);
            }
        };

        if (selectedClient) {
            fetchSmsCampaigns();
        }
    }, [selectedClient, baseUrl]);

    const openCampaignMessages = async (campaign, page = 1, filter = 'all') => {
        try {
            setLoading(true);
            const response = await axios.get(
                `${baseUrl}/api/sms-campaigns/${campaign.id}/stats`,
                {
                    params: {
                        page,
                        limit: itemsPerPage,
                        replyFilter: filter !== 'all' ? filter : undefined
                    }
                }
            );

            console.log('Campaign stats response:', response.data);

            setSelectedCampaign(campaign);
            setCurrentPage(page);
            setReplyFilter(filter);
            setMessages(response.data.data.messages || []);

            const stats = response.data.data.stats || {};
            setTotalRecords(stats.total || 0);
            setOverallDelivered(stats.delivered || 0);
            setOverallFailed(stats.failed || 0);
            setOverallReplied(stats.totalWithReplies || 0);

            setTotalPages(response.data.pagination?.totalPages || 1);
            setError(null);
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
            openCampaignMessages(selectedCampaign, page, replyFilter);
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

    const handleReplyFilterChange = (newFilter) => {
        setReplyFilter(newFilter);
        setCurrentPage(1);
        setPageInput('1');
        openCampaignMessages(selectedCampaign, 1, newFilter);
    };

    const handleItemsPerPageChange = async (newItemsPerPage) => {
        if (selectedCampaign && view === 'messages') {
            setItemsPerPage(newItemsPerPage);
            setCurrentPage(1);
            setPageInput('1');
            openCampaignMessages(selectedCampaign, 1, replyFilter);
        }
    };

    const openLeadActivity = async (leadId) => {
        try {
            setLoading(true);
            const response = await axios.get(
                `${baseUrl}/api/sms-campaigns/${selectedCampaign.id}/lead/${leadId}/activity`
            );

            setSelectedLead(leadId);
            setLeadActivity(response.data.data || null);
            setView("activity");
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
        setLeadActivity(null);
        setError(null);
    };

    // Calculate metrics
    const totalCampaigns = smsCampaigns.length;
    const totalSent = smsCampaigns.reduce((sum, sms) => sum + (sms.sentCount || 0), 0);
    const avgSentPerCampaign = totalCampaigns > 0 ? Math.round(totalSent / totalCampaigns) : 0;
    const activeCampaigns = smsCampaigns.filter(sms => (sms.sentCount || 0) > 0).length;

    // VIEW 1: LIST OF SMS CAMPAIGNS
    if (view === 'list') {
        if (loading) {
            return (
                <div className="flex justify-center items-center h-64">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
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

                <h2 className="text-2xl font-bold text-gray-900 mb-6">SMS Campaigns</h2>

                {/* Summary Stats */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                    <div className="bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 rounded-lg p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-blue-600 mb-1">Total Campaigns</p>
                                <p className="text-2xl font-bold text-blue-900">{totalCampaigns}</p>
                            </div>
                            <MessageSquare className="w-8 h-8 text-blue-500 opacity-50" />
                        </div>
                    </div>

                    <div className="bg-gradient-to-br from-green-50 to-green-100 border border-green-200 rounded-lg p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-green-600 mb-1">Total Sent</p>
                                <p className="text-2xl font-bold text-green-900">{totalSent.toLocaleString()}</p>
                            </div>
                            <CheckCircle className="w-8 h-8 text-green-500 opacity-50" />
                        </div>
                    </div>

                    <div className="bg-gradient-to-br from-purple-50 to-purple-100 border border-purple-200 rounded-lg p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-purple-600 mb-1">Avg per Campaign</p>
                                <p className="text-2xl font-bold text-purple-900">{avgSentPerCampaign.toLocaleString()}</p>
                            </div>
                            <TrendingUp className="w-8 h-8 text-purple-500 opacity-50" />
                        </div>
                    </div>

                    <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 border border-yellow-200 rounded-lg p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-yellow-600 mb-1">Active Campaigns</p>
                                <p className="text-2xl font-bold text-yellow-900">{activeCampaigns}</p>
                            </div>
                            <CheckCircle className="w-8 h-8 text-yellow-500 opacity-50" />
                        </div>
                    </div>
                </div>

                {/* SMS Campaigns Table */}
                <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                        <h3 className="text-lg font-semibold text-gray-900">SMS Campaigns</h3>
                        <p className="text-sm text-gray-500 mt-1">
                            Showing all {smsCampaigns.length} campaigns
                        </p>
                    </div>

                    {smsCampaigns.length === 0 ? (
                        <div className="px-6 py-12 text-center">
                            <MessageSquare className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                            <p className="text-gray-500 font-medium">No SMS campaigns found</p>
                            <p className="text-sm text-gray-400 mt-1">Sync your SMS client to fetch campaigns</p>
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
                                {<tbody className="bg-white divide-y divide-gray-200">
                                    {smsCampaigns.map((sms) => (
                                        <tr
                                            key={sms.id}
                                            className={`hover:bg-gray-50 transition-colors ${(sms.sentCount || 0) > 0 ? "cursor-pointer" : "cursor-not-allowed opacity-60"
                                                }`}
                                            onClick={() => {
                                                if ((sms.sentCount || 0) > 0) {
                                                    openCampaignMessages(sms);
                                                }
                                            }}
                                        >
                                            <td className="px-6 py-4">
                                                <div className="flex items-center">
                                                    <MessageSquare className="w-5 h-5 text-blue-500 mr-3" />
                                                    <span className="text-sm font-medium text-gray-900">
                                                        {sms.name}
                                                    </span>
                                                </div>
                                            </td>

                                            <td className="px-6 py-4">
                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                                    {sms.category?.title || "SMS"}
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
                                </tbody>}
                            </table>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // VIEW 2: MESSAGES FOR A CAMPAIGN
    if (view === 'messages') {
        return (
            <div className="h-[calc(100vh-90px)] flex flex-col animate-fade-in">
                <button
                    onClick={goBackToCampaigns}
                    className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
                >
                    <ArrowLeft className="w-5 h-5" />
                    <span className="font-medium">Back to SMS Campaigns</span>
                </button>

                <h2 className="text-2xl font-bold text-gray-900 mb-1">
                    {selectedCampaign.name}
                </h2>
                <p className="text-sm text-gray-600 mb-6">Messages for SMS ID #{selectedCampaign.mauticId}</p>

                {/* Metric Cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                    <div className="bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 rounded-lg p-3">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-blue-600">Total Sent</p>
                                <p className="text-2xl font-bold text-blue-900">{(totalRecords || 0).toLocaleString()}</p>
                            </div>
                            <TrendingUp className="w-8 h-8 text-blue-500 opacity-50" />
                        </div>
                    </div>

                    <div className="bg-gradient-to-br from-green-50 to-green-100 border border-green-200 rounded-lg p-3">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-green-600">Delivered</p>
                                <p className="text-2xl font-bold text-green-900">{(overallDelivered || 0).toLocaleString()}</p>
                            </div>
                            <CheckCircle className="w-8 h-8 text-green-500 opacity-50" />
                        </div>
                    </div>

                    <div className="bg-gradient-to-br from-purple-50 to-purple-100 border border-purple-200 rounded-lg p-3">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-purple-600">Replied</p>
                                <p className="text-2xl font-bold text-purple-900">{overallReplied.toLocaleString()}</p>
                            </div>
                            <MessageCircle className="w-8 h-8 text-purple-500 opacity-50" />
                        </div>
                    </div>

                    <div className="bg-gradient-to-br from-red-50 to-red-100 border border-red-200 rounded-lg p-3">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-red-600">Failed</p>
                                <p className="text-2xl font-bold text-red-900">{(overallFailed || 0).toLocaleString()}</p>
                            </div>
                            <XCircle className="w-8 h-8 text-red-500 opacity-50" />
                        </div>
                    </div>
                </div>

                {/* Filter Controls */}
                <div className="flex justify-between items-center mb-4">
                    <div className="flex gap-2 items-center">
                        <span className="text-sm text-gray-600 font-medium">Reply Filter:</span>
                        <select
                            value={replyFilter}
                            onChange={(e) => handleReplyFilterChange(e.target.value)}
                            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        >
                            <option value="all">All Messages</option>
                            <option value="Stop">Stop</option>
                            <option value="Other">Other Replies</option>
                        </select>
                    </div>

                    <div className="flex gap-2 items-center">
                        <span className="text-sm text-gray-600 font-medium">Per page:</span>
                        <select
                            value={itemsPerPage}
                            onChange={(e) => handleItemsPerPageChange(parseInt(e.target.value))}
                            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
                        >
                            <option value="50">50</option>
                            <option value="100">100</option>
                            <option value="200">200</option>
                        </select>
                    </div>
                </div>

                {/* Messages Table */}
                <div className="flex-1 bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden flex flex-col">
                    {loading ? (
                        <div className="flex justify-center items-center flex-1">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                        </div>
                    ) : messages.length === 0 ? (
                        <div className="flex-1 flex items-center justify-center">
                            <div className="text-center">
                                <MessageSquare className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                                <p className="text-gray-500 font-medium">No messages found</p>
                            </div>
                        </div>
                    ) : (
                        <div className="overflow-auto flex-1">
                            <table className="w-full">
                                <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Lead ID</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Mobile Number</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reply Text</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reply Date</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {messages.map((msg, idx) => (
                                        <tr key={idx} className="hover:bg-gray-50 transition-colors" onClick={() => openLeadActivity(msg.leadId)}>
                                            <td className="px-4 py-3">
                                                <span className="text-sm font-medium text-gray-900">{msg.leadId}</span>
                                            </td>
                                            <td className="px-4 py-3">
                                                {msg.mobile ? (
                                                    <span className="text-sm text-gray-900 font-mono">{msg.mobile}</span>
                                                ) : (
                                                    <span className="text-gray-400 italic text-sm">-</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 max-w-xs">
                                                {msg.replyText ? (
                                                    <div className="text-sm text-gray-700 truncate" title={msg.replyText}>
                                                        {msg.replyText.length > 50
                                                            ? msg.replyText.substring(0, 50) + '...'
                                                            : msg.replyText}
                                                    </div>
                                                ) : (
                                                    <span className="text-gray-400 italic text-sm">No reply</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3">
                                                {msg.replyCategory ? (
                                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${msg.replyCategory === 'Stop' ? 'bg-green-100 text-green-800' :
                                                        'bg-yellow-100 text-yellow-800'
                                                        }`}>
                                                        {msg.replyCategory}
                                                    </span>
                                                ) : (
                                                    <span className="text-gray-400 text-sm">-</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className="text-sm text-gray-600">
                                                    {msg.repliedAt ? new Date(msg.repliedAt).toLocaleString() : '-'}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Pagination Controls */}
                    <div className="px-4 py-3 border-t border-gray-200 bg-gray-50 flex justify-between items-center">
                        <button
                            onClick={() => goToPage(currentPage - 1)}
                            disabled={currentPage === 1}
                            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                        >
                            Previous
                        </button>

                        <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-700">
                                Page <span className="font-semibold">{currentPage}</span> of <span className="font-semibold">{totalPages}</span>
                            </span>
                            <span className="text-gray-400">|</span>
                            <form onSubmit={handlePageInputSubmit} className="flex gap-2">
                                <input
                                    type="number"
                                    min="1"
                                    max={totalPages}
                                    value={pageInput}
                                    onChange={(e) => setPageInput(e.target.value)}
                                    className="w-16 px-2 py-1 border border-gray-300 rounded text-sm"
                                />
                                <button
                                    type="submit"
                                    className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                                >
                                    Go
                                </button>
                            </form>
                        </div>

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
        if (!leadActivity) {
            return <div>Loading activity...</div>;
        }

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
                        Lead Activity - {leadActivity.mobile || `ID #${leadActivity.leadId}`}
                    </h2>
                    <p className="text-sm text-gray-600">
                        Campaign: {leadActivity.campaign?.name || selectedCampaign.name}
                    </p>
                </div>

                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                    <div className="bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 rounded-lg p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-blue-600 mb-1">SMS Sent</p>
                                <p className="text-3xl font-bold text-blue-900">{leadActivity.message ? '1' : '0'}</p>
                            </div>
                            <MessageSquare className="w-10 h-10 text-blue-500 opacity-50" />
                        </div>
                    </div>

                    <div className="bg-gradient-to-br from-green-50 to-green-100 border border-green-200 rounded-lg p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-green-600 mb-1">Replies</p>
                                <p className="text-3xl font-bold text-green-900">{leadActivity.reply ? '1' : '0'}</p>
                            </div>
                            <MessageCircle className="w-10 h-10 text-green-500 opacity-50" />
                        </div>
                    </div>
                </div>

                {/* Activity Timeline */}
                <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                        <h3 className="text-lg font-semibold text-gray-900">Activity Timeline</h3>
                    </div>

                    <div className="px-6 py-4 space-y-4">
                        {leadActivity.message && (
                            <div className="flex gap-4 p-4 rounded-lg border bg-blue-50 border-blue-200">
                                <div className="flex-shrink-0">
                                    <MessageSquare className="w-6 h-6 text-blue-600" />
                                </div>
                                <div className="flex-1">
                                    <p className="text-sm font-medium text-gray-900 mb-2">SMS Sent</p>
                                    <div className="bg-white rounded p-3 border border-gray-200">
                                        <p className="text-sm text-gray-700">{leadActivity.message.text || 'Message content not available'}</p>
                                    </div>
                                    {leadActivity.message.sentAt && (
                                        <p className="text-xs text-gray-500 mt-2">
                                            Sent: {new Date(leadActivity.message.sentAt).toLocaleString()}
                                        </p>
                                    )}
                                </div>
                            </div>
                        )}

                        {leadActivity.reply && (
                            <div className="flex gap-4 p-4 rounded-lg border bg-green-50 border-green-200">
                                <div className="flex-shrink-0">
                                    <MessageCircle className="w-6 h-6 text-green-600" />
                                </div>
                                <div className="flex-1">
                                    <div className="flex items-center justify-between mb-2">
                                        <p className="text-sm font-medium text-gray-900">Reply Received</p>
                                        {leadActivity.reply.category && (
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${leadActivity.reply.category === 'Stop' ? 'bg-red-100 text-red-800' :
                                                'bg-yellow-100 text-yellow-800'
                                                }`}>
                                                {leadActivity.reply.category}
                                            </span>
                                        )}
                                    </div>
                                    <div className="bg-white rounded p-3 border border-gray-200">
                                        <p className="text-sm text-gray-700">{leadActivity.reply.text}</p>
                                    </div>
                                    {leadActivity.reply.repliedAt && (
                                        <p className="text-xs text-gray-500 mt-2">
                                            Replied: {new Date(leadActivity.reply.repliedAt).toLocaleString()}
                                        </p>
                                    )}
                                </div>
                            </div>
                        )}

                        {!leadActivity.message && !leadActivity.reply && (
                            <div className="text-center py-8">
                                <Activity className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                                <p className="text-gray-500">No activity found for this lead</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    return null;
};

export default MauticSmsSection;