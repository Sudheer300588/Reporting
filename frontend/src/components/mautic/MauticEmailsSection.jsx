import { useState, useEffect, useRef, useMemo } from "react";
import { Mail, ArrowLeftCircle, ArrowRightCircle, Eye, Users, TrendingUp, Calendar } from "lucide-react";
import axios from "axios";


const MauticEmailsSection = ({ campaigns, selectedCampaign, setSelectedCampaign, goBackToCampaigns }) => {

    // draft values allow user to change dates without immediately applying
    const [draftFromDate, setDraftFromDate] = useState("");
    const [draftToDate, setDraftToDate] = useState("");
    // applied values used by the fetch and filters
    const [appliedFromDate, setAppliedFromDate] = useState("");
    const [appliedToDate, setAppliedToDate] = useState("");
    // eslint-disable-next-line no-unused-vars
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
        // showPicker is supported in some Chromium browsers; fallback to focus().
        if (typeof ref.current.showPicker === 'function') {
            try { ref.current.showPicker(); } catch (err) { console.debug(err); }
        }
        if (typeof ref.current.focus === 'function') {
            ref.current.focus();
        }
    };

    // Fetch email reports AND filtered emails when campaign or applied dates change
    useEffect(() => {
        if (!selectedCampaign?.clientId) return;

        const fetchData = async () => {
            setLoadingReports(true);
            try {
                const params = new URLSearchParams();
                if (appliedFromDate) params.append('fromDate', appliedFromDate);
                if (appliedToDate) params.append('toDate', appliedToDate);

                // Fetch reports
                const baseUrl = import.meta.env.VITE_API_URL || "";
                const reportsRes = await axios.get(`${baseUrl}/api/mautic/clients/${selectedCampaign.clientId}/email-reports?${params}`);

                const reports = reportsRes.data.data || [];

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
                console.error('Error fetching email data:', error);
                setEmailReports([]);
            } finally {
                setLoadingReports(false);
            }
        };

        fetchData();
    }, [selectedCampaign?.clientId, appliedFromDate, appliedToDate]);

    const [initialLoadDone, setInitialLoadDone] = useState(false);
    useEffect(() => {
        if (!loadingReports && !initialLoadDone) {
            setInitialLoadDone(true);
        }
    }, [loadingReports]);

    // Calculate stats from actual email reports (date-filtered)
    const getCampaignStats = () => {
        if (!selectedCampaign) {
            return { campaignSent: 0, campaignRead: 0, readPercentage: 0 };
        }

        // If date filter is active, use stats aggregated from `emailReports`
        if (appliedFromDate || appliedToDate) {
            // Aggregate counts from emailReports by matching report.eId -> mauticEmailId
            const aggregateCountsFromReportsForEmail = (email) => {
                // Count sends by reports with a `dateSent` in range
                const sentReports = reportsForEmailByFieldInRange(email.mauticEmailId, 'dateSent', email);
                const sent = sentReports.length;
                // Count reads by reports with a `dateRead` in range
                const readReports = reportsForEmailByFieldInRange(email.mauticEmailId, 'dateRead', email);
                const read = readReports.length;
                return { sent, read };
            };

            let campaignSent = 0;
            let campaignRead = 0;
            selectedCampaign.emails.forEach(e => {
                const { sent, read } = aggregateCountsFromReportsForEmail(e);
                campaignSent += sent;
                campaignRead += read;
            });

            const readPercentage = campaignSent ? ((campaignRead / campaignSent) * 100).toFixed(2) : 0;
            return { campaignSent, campaignRead, readPercentage };
        }

        // No date filter - use original aggregate stats from MauticEmail
        const campaignSent = selectedCampaign.emails.reduce((sum, e) => sum + (e.sentCount || 0), 0);
        const campaignRead = selectedCampaign.emails.reduce((sum, e) => sum + (e.readCount || 0), 0);
        const readPercentage = campaignSent ? ((campaignRead / campaignSent) * 100).toFixed(2) : 0;

        return { campaignSent, campaignRead, readPercentage };
    };

    // no need to call getCampaignStats again and again
    const campaignStats = useMemo(
        () => getCampaignStats(),
        [selectedCampaign, emailReports, emailReportsIndex, appliedFromDate, appliedToDate]
    );

    // Get stats for individual emails (date-filtered)
    const getEmailStats = (email) => {
        // If date filter is active, use aggregated stats from `emailReports`
        if (appliedFromDate || appliedToDate) {
            const sent = reportsForEmailByFieldInRange(email.mauticEmailId, 'dateSent', email).length;
            const read = reportsForEmailByFieldInRange(email.mauticEmailId, 'dateRead', email).length;
            const readRate = sent ? ((read / sent) * 100).toFixed(2) : 0;
            return { sent, read, readRate };
        }

        // No date filter - use original aggregate stats
        const sent = email.sentCount || 0;
        const read = email.readCount || 0;
        const readRate = sent ? ((read / sent) * 100).toFixed(2) : 0;

        return { sent, read, readRate };
    };

    const navigateCampaign = (direction) => {
        const currentIndex = campaigns.findIndex(
            (c) => c.id === selectedCampaign?.id
        );
        if (direction === "next" && currentIndex < campaigns.length - 1) {
            setSelectedCampaign(campaigns[currentIndex + 1]);
        } else if (direction === "prev" && currentIndex > 0) {
            setSelectedCampaign(campaigns[currentIndex - 1]);
        }
    };

    const filteredSegments = selectedCampaign?.segments?.filter(seg => {
        if (!appliedFromDate && !appliedToDate) return true;
        if (!seg.dateAdded) return false;

        const segDate = new Date(seg.dateAdded);

        if (appliedFromDate) {
            const from = new Date(appliedFromDate);
            from.setHours(0, 0, 0, 0);
            if (segDate < from) return false;
        }

        if (appliedToDate) {
            const to = new Date(appliedToDate);
            to.setHours(23, 59, 59, 999);
            if (segDate > to) return false;
        }

        return true;
    });

    return (
        <div className="animate-fade-in">
            <div className="flex items-center justify-between mb-6">
                <button onClick={goBackToCampaigns} className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors">
                    <ArrowLeftCircle className="w-6 h-6" />
                    <span className="font-medium">Back to Campaigns</span>
                </button>

                <div className="flex items-center gap-2">
                    <button
                        onClick={() => navigateCampaign('prev')}
                        disabled={campaigns.findIndex(c => c.id === selectedCampaign?.id) === 0}
                        className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        title="Previous Campaign"
                    >
                        <ArrowLeftCircle className="w-5 h-5" />
                    </button>
                    <button
                        onClick={() => navigateCampaign('next')}
                        disabled={campaigns.findIndex(c => c.id === selectedCampaign?.id) === campaigns.length - 1}
                        className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        title="Next Campaign"
                    >
                        <ArrowRightCircle className="w-5 h-5" />
                    </button>
                </div>
            </div>

            <div className="mb-8">
                <div className="flex items-center gap-3 mb-2">
                    <h1 className="text-3xl font-bold text-gray-900">{selectedCampaign?.name}</h1>
                    {!selectedCampaign?.isPublished && (
                        <span className="px-3 py-1 text-sm rounded-full bg-gray-200 text-gray-600">Unpublished</span>
                    )}
                </div>
                {selectedCampaign?.description && <p className="text-gray-500 mt-2">{selectedCampaign?.description}</p>}
            </div>

            {/* Date Range Filter */}
            <div className="rounded-xl shadow-md p-5 mb-6 bg-gradient-to-br from-green-50 to-green-100 border border-green-200">
                <div className="flex flex-col md:flex-row items-start md:items-end gap-3">
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
                                className="-ml-8 p-2 rounded-md text-gray-600 hover:text-black transition-colors"
                            >
                                <Calendar className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    <div className="flex flex-col">
                        <label className="text-xs font-semibold text-gray-700 mb-1">To Date</label>
                        <div className="flex items-center">
                            <input
                                ref={toDateRef}
                                type="date"
                                value={draftToDate}
                                onChange={(e) => setDraftToDate(e.target.value)}
                                className={` hide-date-icon px-4 py-2 border-2 border-gray-300 rounded-lg text-sm focus:border-green-700 bg-white font-medium text-black`}
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

                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => {
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

            {/* Stats Overview Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                <div className="bg-gradient-to-br from-primary-500 to-primary-700 rounded-xl p-3">
                    <div className="flex items-center gap-2 mb-2">
                        <Users className="w-4 h-4 text-white" />
                        <div className="text-sm text-white font-semibold">Total Segments</div>
                    </div>
                    <div className="text-2xl font-bold text-white">
                        {filteredSegments?.length}
                    </div>
                </div>

                <div className="bg-gradient-to-br from-secondary-500 to-secondary-700 rounded-xl p-3">
                    <div className="flex items-center gap-2 mb-2">
                        <Mail className="w-4 h-4 text-white" />
                        <div className="text-sm text-white font-semibold">Total Emails</div>
                    </div>
                    <div className="text-2xl font-bold text-white">
                        {selectedCampaign?.emails?.length || 0}
                    </div>
                </div>

                {selectedCampaign?.isPublished && (
                    <>
                        <div className="bg-gradient-to-br from-accent-600 to-accent-800 rounded-xl p-3">
                            <div className="flex items-center gap-2 mb-2">
                                <Mail className="w-4 h-4 text-white" />
                                <div className="text-sm text-white font-bold uppercase tracking-wide">
                                    Emails Sent
                                </div>
                            </div>
                            <div className="text-2xl font-bold text-white">
                                {!initialLoadDone ? '...' : getCampaignStats().campaignSent.toLocaleString()}
                            </div>
                            <div className="text-xs text-white mt-2 font-medium">Total deliveries</div>
                        </div>

                        <div className="bg-gradient-to-br from-secondary-700 to-secondary-900 rounded-xl p-3">
                            <div className="flex items-center gap-2 mb-2">
                                <Eye className="w-4 h-4 text-white" />
                                <div className="text-sm text-white font-bold uppercase tracking-wide">
                                    Emails Read
                                </div>
                            </div>
                            <div className="text-2xl font-bold text-white">
                                {!initialLoadDone ? '...' : getCampaignStats().campaignRead.toLocaleString()}
                            </div>
                            <div className="text-xs text-white mt-2 font-medium">Total opens</div>
                        </div>
                    </>
                )}
            </div>

            {/* Overall Read Rate */}
            {selectedCampaign?.isPublished && (
                <div className="mb-8">
                    <div className={`rounded-2xl p-4 shadow-xl border-2 
                        ${campaignStats.readPercentage > 75
                            ? "bg-green-50 border-green-400"
                            : campaignStats.readPercentage > 50
                                ? "bg-yellow-50 border-yellow-400"
                                : "bg-red-50 border-red-400"
                        }
                        transition-colors duration-300`}
                    >

                        {/* Header */}
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-4">
                                <div className={`p-3 rounded-lg shadow-inner
                                    ${campaignStats.readPercentage > 75
                                        ? "bg-green-200"
                                        : campaignStats.readPercentage > 50
                                            ? "bg-yellow-200"
                                            : "bg-red-200"
                                    }`}
                                >
                                    <Eye
                                        className={`w-5 h-5 
                                        ${campaignStats.readPercentage > 75
                                                ? "text-green-800"
                                                : campaignStats.readPercentage > 50
                                                    ? "text-yellow-800"
                                                    : "text-red-800"
                                            }`}
                                    />
                                </div>
                                <div>
                                    <h3 className="text-xl font-semibold text-gray-900">Overall Read Rate</h3>
                                    <p className="text-gray-500 text-sm mt-1">
                                        Based on all emails in this campaign
                                    </p>
                                </div>
                            </div>

                            {/* Percentage number */}
                            <div className="text-2xl font-extrabold">
                                <span
                                    className={
                                        campaignStats.readPercentage > 75
                                            ? "text-green-900"
                                            : campaignStats.readPercentage > 50
                                                ? "text-yellow-900"
                                                : "text-red-900"
                                    }
                                >
                                    {campaignStats.readPercentage}%
                                </span>
                            </div>
                        </div>

                        {/* Progress Bar */}
                        <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                            <div
                                className={`h-3 rounded-full transition-all duration-500
                                ${campaignStats.readPercentage > 75
                                        ? "bg-green-500"
                                        : campaignStats.readPercentage > 50
                                            ? "bg-yellow-400"
                                            : "bg-red-500"
                                    }`}
                                style={{
                                    width: `${campaignStats.readPercentage}%`,
                                }}
                            ></div>
                        </div>
                    </div>
                </div>
            )}

            {/* Individual Email Performance */}
            {selectedCampaign?.emails?.length > 0 && selectedCampaign?.isPublished && (
                <div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                        <Mail className="w-7 h-7 text-blue-600" />
                        Individual Email Performance
                    </h2>

                    <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gradient-to-r from-gray-50 to-gray-100">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                                            Email
                                        </th>
                                        <th className="px-4 py-3 text-center text-xs font-bold text-blue-700 uppercase tracking-wider">
                                            <div className="flex items-center justify-center gap-1">
                                                <Mail className="w-4 h-4" />
                                                Sent
                                            </div>
                                        </th>
                                        <th className="px-4 py-3 text-center text-xs font-bold text-green-700 uppercase tracking-wider">
                                            <div className="flex items-center justify-center gap-1">
                                                <Eye className="w-4 h-4" />
                                                Read
                                            </div>
                                        </th>
                                        <th className="px-4 py-3 text-center text-xs font-bold text-purple-700 uppercase tracking-wider">
                                            <div className="flex items-center justify-center gap-1">
                                                <TrendingUp className="w-4 h-4" />
                                                Read Rate
                                            </div>
                                        </th>
                                    </tr>
                                </thead>

                                <tbody className="bg-white divide-y divide-gray-100">
                                    {selectedCampaign?.emails?.map((email, index) => {
                                        const stats = getEmailStats(email);

                                        return (
                                            <tr
                                                key={email.id}
                                                className={`hover:bg-blue-50 transition-colors ${index % 2 === 0 ? "bg-white" : "bg-gray-50"}`}
                                            >
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-2">
                                                        <Mail className="w-4 h-4 text-gray-400" />
                                                        <span className="text-sm font-medium text-gray-700 truncate">
                                                            {email.name}
                                                        </span>
                                                    </div>
                                                </td>

                                                <td className="px-4 py-3 text-center">
                                                    <span className="text-sm font-semibold text-blue-800">
                                                        {!initialLoadDone ? '...' : stats.sent.toLocaleString()}
                                                    </span>
                                                </td>

                                                <td className="px-4 py-3 text-center">
                                                    <span className="text-sm font-semibold text-green-800">
                                                        {!initialLoadDone ? '...' : stats.read.toLocaleString()}
                                                    </span>
                                                </td>

                                                <td className="px-4 py-3 text-center">
                                                    <span
                                                        className={`inline-flex items-center justify-center px-3 py-1 rounded-full text-xs font-bold ${stats.readRate > 75
                                                            ? "bg-green-100 text-green-800"
                                                            : stats.readRate > 50
                                                                ? "bg-yellow-100 text-yellow-800"
                                                                : "bg-red-100 text-red-800"
                                                            }`}
                                                    >
                                                        {!initialLoadDone ? '...' : `${stats.readRate}%`}
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>

                                {/* Table Footer Totals */}
                                <tfoot className="bg-gradient-to-r from-blue-100 to-purple-100 border-t-2 border-blue-300">
                                    <tr>
                                        <td className="px-4 py-3 font-bold text-gray-900 text-sm">
                                            Total ({selectedCampaign?.emails?.length} Emails)
                                        </td>

                                        <td className="px-4 py-3 text-center">
                                            <span className="text-lg font-extrabold text-blue-900">
                                                {!initialLoadDone ? '...' : getCampaignStats().campaignSent.toLocaleString()}
                                            </span>
                                        </td>

                                        <td className="px-4 py-3 text-center">
                                            <span className="text-lg font-extrabold text-green-900">
                                                {!initialLoadDone ? '...' : getCampaignStats().campaignRead.toLocaleString()}
                                            </span>
                                        </td>

                                        <td className="px-4 py-3 text-center">
                                            <span
                                                className={`inline-flex items-center px-3 py-1 rounded font-extrabold text-sm ${getCampaignStats().readPercentage > 75
                                                    ? "bg-green-200 text-green-900"
                                                    : getCampaignStats().readPercentage > 50
                                                        ? "bg-yellow-200 text-yellow-900"
                                                        : "bg-red-200 text-red-900"
                                                    }`}
                                            >
                                                {!initialLoadDone ? '...' : `${getCampaignStats().readPercentage}%`}
                                            </span>
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

export default MauticEmailsSection;