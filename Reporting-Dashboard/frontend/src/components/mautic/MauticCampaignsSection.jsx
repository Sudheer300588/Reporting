import { useState, useRef, useEffect } from "react";
import { Mail, ArrowLeft, Activity, Users, BarChart3, TrendingUp, Calendar } from "lucide-react";
import axios from "axios";


const MauticCampaignsSection = ({ campaigns, selectedClient, loadingCampaigns, goBackToServices, openCampaignDetails }) => {
    // draft values (user can change but they don't apply until Submit)
    const [draftFromDate, setDraftFromDate] = useState("");
    const [draftToDate, setDraftToDate] = useState("");
    // applied values used for filtering
    const [appliedFromDate, setAppliedFromDate] = useState("");
    const [appliedToDate, setAppliedToDate] = useState("");
    const [emailReports, setEmailReports] = useState([]);
    const [loadingReports, setLoadingReports] = useState(false);
    const [emailReportsIndex, setEmailReportsIndex] = useState(new Map());

    const fromDateRef = useRef(null);
    const toDateRef = useRef(null);

    // Helper: get reports for a specific mauticEmail that have a particular date field within range
    const reportsForEmailByFieldInRange = (emailId, field, email) => {
        const entry = emailReportsIndex.get(String(emailId));

        // New aggregate format
        if (entry && typeof entry.sentCount === "number") {
            const count = field === 'dateSent' ? entry.sentCount : entry.readCount;
            return new Array(count).fill(null);
        }

        if (appliedFromDate || appliedToDate) {
            return [];
        }
    };

    const openPicker = (ref) => {
        if (!ref?.current) return;
        if (typeof ref.current.showPicker === 'function') {
            try { ref.current.showPicker(); } catch (err) { console.debug(err); }
        }
        if (typeof ref.current.focus === 'function') ref.current.focus();
    };

    // Fetch email reports when client or applied dates change
    useEffect(() => {
        if (!selectedClient?.id) return;

        const fetchReports = async () => {
            setLoadingReports(true);
            try {
                const params = new URLSearchParams();
                if (appliedFromDate) params.append('fromDate', appliedFromDate);
                if (appliedToDate) params.append('toDate', appliedToDate);

                // Fetch reports
                const baseUrl = import.meta.env.VITE_API_URL || "";
                const response = await axios.get(`${baseUrl}/api/mautic/clients/${selectedClient.mauticApiId}/email-reports?${params}`);

                const reports = response.data.data || [];

                // Detect if backend returned aggregated counts
                const isAggregated = reports.length > 0;

                const reportIndex = new Map();

                if (isAggregated) {
                    // New format: aggregated by eId
                    for (const r of reports) {
                        reportIndex.set(String(r.eId), { sentCount: r.sentCount || 0, readCount: r.readCount || 0 });
                    }
                }

                setEmailReports(reports);
                setEmailReportsIndex(reportIndex);

            } catch (error) {
                console.error('Error fetching email reports:', error);
                setEmailReports([]);
            } finally {
                setLoadingReports(false);
            }
        };

        fetchReports();
    }, [selectedClient?.id, appliedFromDate, appliedToDate]);

    const [initialLoadDone, setInitialLoadDone] = useState(false);
    useEffect(() => {
        if (!loadingReports && !initialLoadDone) setInitialLoadDone(true);
    }, [loadingReports]);

    const getAllCampaignsEmailsSent = (campaigns) => {
        if (!Array.isArray(campaigns)) return 0;
        // If date filter is active, use email reports
        if (appliedFromDate || appliedToDate) {
            let total = 0;
            campaigns.forEach(campaign => {
                campaign.emails.forEach(email => {
                    total += reportsForEmailByFieldInRange(email.mauticEmailId, 'dateSent', email).length;
                });
            });
            return total;
        }
        // No filter - use aggregate counts
        const allCampaignsEmailsSent = campaigns.reduce((a, c) => a + getCampaignEmailsSent(c), 0);
        return allCampaignsEmailsSent;
    };

    const getCampaignEmailsSent = (campaign) => {
        if (!campaign) return 0;

        // If date filter is active, use email reports
        if (appliedFromDate || appliedToDate) {
            let total = 0;
            campaign.emails.forEach(email => {
                total += reportsForEmailByFieldInRange(email.mauticEmailId, 'dateSent', email).length;
            });
            return total;
        }
        // No filter - use aggregate counts
        const campaignEmailsSent = campaign.emails.reduce((a, e) => a + (e.sentCount || 0), 0);
        return campaignEmailsSent;
    };

    // Get unique emails across all campaigns (avoid double-counting)
    const getUniqueEmailsCount = (campaigns) => {
        const uniqueEmailIds = new Set();
        campaigns.forEach(campaign => {
            campaign.emails.forEach(email => {
                uniqueEmailIds.add(email.mauticEmailId);
            });
        });
        return uniqueEmailIds.size;
    };

    return (
        <div className="animate-fade-in">
            <button
                onClick={goBackToServices}
                className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6"
            >
                <ArrowLeft className="w-5 h-5" />
                <span className="font-medium">Back to {selectedClient?.name} Services</span>
            </button>

            <div className="mb-8">
                <h1 className="text-3xl font-bold text-gray-900">Autovation Campaigns</h1>
                <p className="text-gray-500 mt-2">Viewing campaigns for <span className="font-semibold">{selectedClient?.name}</span></p>
            </div>

            {loadingCampaigns ? (
                <div className="flex justify-center items-center py-12"><div className="text-gray-500">Loading campaigns...</div></div>
            ) : campaigns.length === 0 ? (
                <div className="flex justify-center items-center py-12"><div className="text-gray-400">No campaigns found.</div></div>
            ) : (
                <>
                    {/* Date Range Filter */}
                    <div className="rounded-xl shadow-md p-5 mb-6 bg-gradient-to-br from-green-50 to-green-100 border border-green-200">
                        <div className="flex flex-col md:flex-row items-start md:items-end gap-3">
                            <div className="flex items-center gap-2">
                                <div className="flex flex-col">
                                    <label className="text-xs font-semibold text-gray-700 mb-1">From Date</label>
                                    <div className="flex items-center">
                                        <input
                                            ref={fromDateRef}
                                            type="date"
                                            value={draftFromDate}
                                            onChange={(e) => setDraftFromDate(e.target.value)}
                                            className={`hide-date-icon px-4 py-2 border-2 border-gray-300 rounded-lg text-sm focus:border-green-700 bg-white font-medium text-black`}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => openPicker(fromDateRef)}
                                            title="Open date picker"
                                            className="-ml-8 transparent p-2 rounded-md text-gray-600 hover:text-black transition-colors"
                                        >
                                            <Calendar className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                <div className="flex flex-col">
                                    <label className="text-xs font-semibold text-gray-700 mb-1">To Date</label>
                                    <div className="flex items-center">
                                        <input
                                            ref={toDateRef}
                                            type="date"
                                            value={draftToDate}
                                            onChange={(e) => setDraftToDate(e.target.value)}
                                            className={`hide-date-icon px-4 py-2 border-2 border-gray-300 rounded-lg text-sm focus:border-green-700 bg-white font-medium text-black`}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => openPicker(toDateRef)}
                                            title="Open date picker"
                                            className="-ml-8 p-2 rounded-md text-gray-600 hover:text-black transition-colors"
                                        >
                                            <Calendar className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => {
                                        // apply the draft dates
                                        setAppliedFromDate(draftFromDate);
                                        setAppliedToDate(draftToDate);
                                    }}
                                    className="px-4 py-2 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-lg text-sm font-semibold hover:from-green-700 hover:to-green-800 shadow-md hover:shadow-lg transition-all"
                                >
                                    Apply
                                </button>

                                <button
                                    onClick={() => {
                                        setDraftFromDate('');
                                        setDraftToDate('');
                                        setAppliedFromDate('');
                                        setAppliedToDate('');
                                    }}
                                    className="px-4 py-2 bg-gradient-to-r from-gray-600 to-gray-700 text-white rounded-lg text-sm font-semibold hover:from-gray-700 hover:to-gray-800 shadow-md hover:shadow-lg transition-all"
                                >
                                    Clear
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Total Summary */}
                    <div className="bg-gradient-to-br from-blue-50 to-purple-50 rounded-xl shadow-xl border-2 border-blue-300 overflow-hidden">
                        <div className="p-3 bg-gradient-to-r from-primary-600 to-primary-800">
                            <div className="flex items-center gap-3">
                                <BarChart3 className="w-4 h-4 text-white" />
                                <h3 className="text-xl font-bold text-white">Overall Campaign Summary</h3>
                            </div>
                        </div>
                        <div className="p-4">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div className="bg-gradient-to-br from-primary-500 to-primary-700 rounded-xl p-3">
                                    <div className="flex items-center gap-2 mb-2">
                                        <Activity className="w-3 h-3 text-white" />
                                        <div className="text-xs text-white font-bold uppercase">Total Campaigns</div>
                                    </div>
                                    <div className="text-2xl font-extrabold text-white">{campaigns.length}</div>
                                </div>
                                <div className="bg-gradient-to-br from-secondary-500 to-secondary-700 rounded-xl p-3">
                                    <div className="flex items-center gap-2 mb-2">
                                        <Users className="w-3 h-3 text-white" />
                                        <div className="text-xs text-white font-bold uppercase">Total Segments</div>
                                    </div>
                                    <div className="text-2xl font-extrabold text-white">{campaigns[0]?.segments?.length || 0}</div>
                                </div>
                                <div className="bg-gradient-to-br from-accent-600 to-accent-800 rounded-xl p-3">
                                    <div className="flex items-center gap-2 mb-2">
                                        <Mail className="w-3 h-3 text-white" />
                                        <div className="text-xs text-white font-bold uppercase">Total Emails</div>
                                    </div>
                                    <div className="text-2xl font-extrabold text-white">{getUniqueEmailsCount(campaigns)}</div>
                                </div>
                                <div className="bg-gradient-to-br from-secondary-700 to-secondary-900 rounded-xl p-3">
                                    <div className="flex items-center gap-2 mb-2">
                                        <Mail className="w-3 h-3 text-white" />
                                        <div className="text-xs text-white font-bold uppercase">Total Emails Sent</div>
                                    </div>
                                    <div className="text-2xl font-extrabold text-white">
                                        {!initialLoadDone ? '...' : getAllCampaignsEmailsSent(campaigns).toLocaleString()}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Campaigns Table - Compact Row View */}
                    <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden mt-8">
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gradient-to-r from-gray-50 to-gray-100">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                                            Campaign Name
                                        </th>
                                        <th className="px-4 py-3 text-center text-xs font-bold text-purple-700 uppercase tracking-wider">
                                            <div className="flex items-center justify-center gap-1">
                                                <Mail className="w-4 h-4" />
                                                Emails
                                            </div>
                                        </th>
                                        <th className="px-4 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider">
                                            <div className="flex items-center justify-center gap-1">
                                                <Mail className="w-4 h-4" />
                                                Emails Sent
                                            </div>
                                        </th>
                                        <th className="px-4 py-3 text-center text-xs font-bold text-green-700 uppercase tracking-wider">
                                            <div className="flex items-center justify-center gap-1">
                                                <TrendingUp className="w-4 h-4" />
                                                Read Rate
                                            </div>
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-100">
                                    {campaigns.map((campaign, index) => {
                                        // Calculate sent/read using date-filtered reports if filter is active
                                        let campaignSent, campaignRead;
                                        if (appliedFromDate || appliedToDate) {
                                            campaignSent = 0;
                                            campaignRead = 0;
                                            campaign.emails.forEach(email => {
                                                campaignSent += reportsForEmailByFieldInRange(email.mauticEmailId, 'dateSent', email).length;
                                                campaignRead += reportsForEmailByFieldInRange(email.mauticEmailId, 'dateRead', email).length;
                                            });
                                        } else {
                                            campaignSent = campaign.emails.reduce((a, e) => a + e.sentCount, 0);
                                            campaignRead = campaign.emails.reduce((a, e) => a + e.readCount, 0);
                                        }
                                        const readPercentage = campaignSent ? ((campaignRead / campaignSent) * 100).toFixed(2) : 0;

                                        return (
                                            <tr
                                                key={campaign.id}
                                                className={`hover:bg-blue-50 transition-colors cursor-pointer ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}
                                                onClick={() => openCampaignDetails(campaign)}
                                            >
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-2">
                                                        <Activity className="w-4 h-4 text-purple-600" />
                                                        <div>
                                                            <div className="font-semibold text-gray-900 text-sm">{campaign.name}</div>
                                                            {!campaign.isPublished && (
                                                                <span className="inline-block mt-1 px-2 py-0.5 text-xs font-semibold rounded-full bg-amber-100 text-amber-700">
                                                                    Unpublished
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <span className="text-sm font-bold text-purple-800">{campaign.emails.length}</span>
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <span className="text-sm font-bold text-gray-800">{!initialLoadDone ? '...' : getCampaignEmailsSent(campaign).toLocaleString()}</span>
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    {campaign.isPublished ? (
                                                        <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-bold ${readPercentage > 75
                                                            ? "bg-green-100 text-green-800"
                                                            : readPercentage > 50
                                                                ? "bg-yellow-100 text-yellow-800"
                                                                : "bg-red-100 text-red-800"
                                                            }`}>
                                                            {!initialLoadDone ? '...' : readPercentage}%
                                                        </span>
                                                    ) : (
                                                        <span className="text-gray-400 text-xs">N/A</span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}
        </div>
    )
}

export default MauticCampaignsSection;