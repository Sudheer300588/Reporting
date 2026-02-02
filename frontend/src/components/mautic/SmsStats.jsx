import { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { ArrowLeft, X } from "lucide-react";
import axios from "axios";
import { useMauticStore } from "../../zustand/useMauticStore";

export default function SmsStats({ onBack, campaign, isModal = false, onOpenContact }) {
    // Support both route params and modal prop-based usage
    const { id: routeId } = useParams();
    const smsId = campaign?.id || routeId;
    const location = useLocation();

    const navigate = useNavigate();
    const { smsStatsCache, setSmsStats } = useMauticStore();

    const [statsData, setStatsData] = useState(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [loading, setLoading] = useState(false);
    const [gotoPageInput, setGotoPageInput] = useState("");
    const [gotoInvalid, setGotoInvalid] = useState(false);
    const recordsPerPage = 100;

    const cacheKey = `${smsId}-${currentPage}`;
    const totalPages = Math.ceil((statsData?.totalRecords || 0) / recordsPerPage);

    const handleGoto = () => {
        const pageNum = parseInt(gotoPageInput, 10);
        if (!pageNum || pageNum < 1 || pageNum > totalPages) {
            setGotoInvalid(true);
            return;
        }
        setGotoInvalid(false);
        setCurrentPage(pageNum);
        setGotoPageInput("");
    };

    const fetchPage = async (page = 1) => {
        const key = `${smsId}-${page}`;
        // 🧠 Use cache if available
        if (smsStatsCache[key]) {
            setStatsData(smsStatsCache[key]);
            return;
        }

        setLoading(true);
        try {
            const baseUrl = import.meta.env.VITE_API_URL || "";
            const res = await axios.get(`${baseUrl}/api/mautic/sms/${smsId}/stats`, {
                params: { page, limit: recordsPerPage },
            });
            setSmsStats(smsId, page, res.data);
            setStatsData(res.data);
        } catch (err) {
            console.error("Error fetching stats:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchPage(currentPage);
    }, [smsId, currentPage]);

    const handleRowClick = (leadId) => {
        if (onOpenContact) {
            // Modal mode: call parent handler
            onOpenContact(leadId);
        } else if (isModal) {
            // Modal mode but no handler: do nothing
            return;
        } else {
            // Route mode: navigate
            navigate(`/contact/${leadId}?smsId=${smsId}`);
        }
    };

    // Show back button only if opened via /sms/... route (Services page)
    const isStandaloneRoute = location.pathname.startsWith("/sms/");

    const {
        stats = [],
        campaignName = "",
        totalRecords = 0,
        totalSuccessful = 0,
        totalFailed = 0,
    } = statsData || {};

    const content = (
        <div className="w-full h-[calc(100vh-90px)] animate-fade-in flex flex-col">
            {/* Optional Back Button (only for standalone route usage) */}
            {isStandaloneRoute && (
                <div className="flex items-center justify-between mb-4">
                    <button
                        onClick={() => navigate('/services')}
                        className="flex items-center gap-2 text-gray-700 hover:text-blue-600 font-semibold transition-colors cursor-pointer"
                    >
                        <ArrowLeft size={18} />
                        <span>Back</span>
                    </button>
                </div>
            )}

            {/* Title */}
            <h1 className="text-2xl font-bold text-gray-800 tracking-tight">
                📊 SMS Campaign: {campaign?.name || `#${smsId}`}
            </h1>
            {campaignName && (
                <p className="text-gray-500 mb-4">{campaignName}</p>
            )}

            {/* Stat cards */}
            <div className="grid sm:grid-cols-3 gap-6 mb-6 flex-shrink-0">
                <div className="p-3 rounded-2xl bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 shadow-sm">
                    <p className="text-sm text-gray-600 font-medium">Total Sent</p>
                    <p className="text-2xl font-bold text-blue-700 mt-1">{totalRecords}</p>
                </div>
                <div className="p-3 rounded-2xl bg-gradient-to-br from-green-50 to-green-100 border border-green-200 shadow-sm">
                    <p className="text-sm text-gray-600 font-medium">Successful</p>
                    <p className="text-2xl font-bold text-green-700 mt-1">{totalSuccessful}</p>
                </div>
                <div className="p-3 rounded-2xl bg-gradient-to-br from-red-50 to-red-100 border border-red-200 shadow-sm">
                    <p className="text-sm text-gray-600 font-medium">Failed</p>
                    <p className="text-2xl font-bold text-red-700 mt-1">{totalFailed}</p>
                </div>
            </div>

            {/* Table + Pagination container */}
            <div className="flex-1 flex flex-col bg-white rounded-2xl shadow-md border border-gray-200 overflow-hidden">
                <div className="overflow-auto flex-1">
                    {loading ? (
                        <div className="p-10 text-center text-gray-500">Loading...</div>
                    ) : (
                        <table className="w-full text-sm text-gray-700 min-w-[600px]">
                            <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
                                <tr>
                                    <th className="text-left py-3 px-4 font-semibold">Lead ID</th>
                                    <th className="text-left py-3 px-4 font-semibold">Date Sent</th>
                                    <th className="text-left py-3 px-4 font-semibold">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {stats.map((stat, i) => (
                                    <tr
                                        key={stat.id || i}
                                        onClick={() => handleRowClick(stat.lead_id)}
                                        className="cursor-pointer transition-colors hover:bg-blue-50 even:bg-gray-50"
                                    >
                                        <td className="py-3 px-4 border-t border-gray-100 font-medium text-gray-800">
                                            {stat.lead_id}
                                        </td>
                                        <td className="py-3 px-4 border-t border-gray-100">
                                            {stat.date_sent}
                                        </td>
                                        <td className="py-3 px-4 border-t border-gray-100">
                                            {stat.is_failed === "1" ? (
                                                <span className="inline-block px-2 py-1 text-xs font-semibold text-red-700 bg-red-100 rounded-lg">
                                                    Failed
                                                </span>
                                            ) : (
                                                <span className="inline-block px-2 py-1 text-xs font-semibold text-green-700 bg-green-100 rounded-lg">
                                                    Sent
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* Pagination footer */}
                {totalRecords > recordsPerPage && (
                    <div className="border-t border-gray-200 bg-gray-50 px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 flex-shrink-0">
                        <div className="text-sm text-gray-700 font-medium">
                            Showing{" "}
                            <span className="font-bold text-blue-600">
                                {(currentPage - 1) * recordsPerPage + 1}
                            </span>{" "}
                            to{" "}
                            <span className="font-bold text-blue-600">
                                {Math.min(currentPage * recordsPerPage, totalRecords)}
                            </span>{" "}
                            of{" "}
                            <span className="font-bold text-blue-600">
                                {totalRecords.toLocaleString()}
                            </span>{" "}
                            records
                        </div>

                        {/* Full pagination controls */}
                        <div className="flex items-center gap-2 flex-wrap">
                            <button
                                onClick={() => setCurrentPage(1)}
                                disabled={currentPage === 1}
                                className="px-3 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-blue-50 disabled:opacity-40 transition-all cursor-pointer"
                                title="First Page"
                            >
                                ««
                            </button>
                            <button
                                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                                disabled={currentPage === 1}
                                className="px-4 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-blue-50 disabled:opacity-40 transition-all cursor-pointer"
                            >
                                Previous
                            </button>
                            <div className="px-4 py-2 text-sm font-bold text-gray-900 bg-blue-50 border border-blue-200 rounded-lg shadow-sm">
                                Page {currentPage} of {totalPages}
                            </div>
                            <button
                                onClick={() =>
                                    setCurrentPage(Math.min(totalPages, currentPage + 1))
                                }
                                disabled={currentPage === totalPages}
                                className="px-4 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-blue-50 disabled:opacity-40 transition-all cursor-pointer"
                            >
                                Next
                            </button>
                            <button
                                onClick={() => setCurrentPage(totalPages)}
                                disabled={currentPage === totalPages}
                                className="px-3 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-blue-50 disabled:opacity-40 transition-all cursor-pointer"
                                title="Last Page"
                            >
                                »»
                            </button>

                            {/* Jump to page input */}
                            <div className="flex items-center gap-2 ml-3 pl-3 border-l border-gray-300">
                                <span className="text-xs text-gray-600 font-medium">Jump to:</span>
                                <input
                                    type="number"
                                    min="1"
                                    max={totalPages}
                                    value={gotoPageInput}
                                    onChange={(e) => setGotoPageInput(e.target.value)}
                                    onKeyDown={(e) => e.key === "Enter" && handleGoto()}
                                    placeholder="Page #"
                                    className={`w-20 px-3 py-2 rounded-lg text-sm font-medium border focus:ring-2 focus:ring-blue-500 ${gotoInvalid
                                        ? "border-red-500 ring-1 ring-red-300"
                                        : "border-gray-300"
                                        }`}
                                />
                                <button
                                    onClick={handleGoto}
                                    className="px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm cursor-pointer"
                                >
                                    Go
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );

    // Return full page layout
    return (
        <div className="w-full h-full flex flex-col p-6">
            {content}
        </div>
    );
}
