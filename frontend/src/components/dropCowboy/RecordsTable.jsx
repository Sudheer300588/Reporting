import React, { useState, useEffect, useRef } from "react";
import {
  Phone,
  Mail,
  Building2,
  Clock,
  CheckCircle,
  XCircle,
  Minus,
  Loader2,
} from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";

// Backend API base URL - uses relative path for same-origin requests
const API_BASE_URL = import.meta.env.VITE_API_URL || "";

const RecordsTable = ({ campaigns }) => {
  const { user } = useAuth();
  const [serverRecords, setServerRecords] = useState([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [loadingPage, setLoadingPage] = useState(false);
  const [metrics, setMetrics] = useState({
    totalVoicemailsSent: 0,
    successfulDeliveries: 0,
    deliveryRate: 0,
    failedDeliveries: 0,
    failureRate: 0,
    otherStatus: 0,
    otherStatusRate: 0,
    totalCampaignCost: 0,
  });
  // Load last used page from localStorage
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("dc_records_page");
      if (saved) {
        const n = parseInt(saved, 10);
        if (!Number.isNaN(n) && n >= 1) setCurrentPage(n);
      }
    } catch (e) {
      // ignore
    }
  }, []);

  // On mount, fetch the initial page (respect saved page)
  useEffect(() => {
    const saved = (() => {
      try {
        return (
          parseInt(window.localStorage.getItem("dc_records_page"), 10) || 1
        );
      } catch (e) {
        return 1;
      }
    })();
    fetchPage(saved);
  }, []);

  // Refs to capture/restore scroll ratio when changing pages
  const tableContainerRef = useRef(null);
  const scrollRatioRef = useRef(0);
  const maintainScrollRef = useRef(false);
  const [fadeIn, setFadeIn] = useState(true);

  const goToPage = (page, opts = { maintain: undefined }) => {
    const container = tableContainerRef.current;
    if (container) {
      const maxScroll = Math.max(
        0,
        container.scrollHeight - container.clientHeight
      );
      const scrolled = container.scrollTop;
      scrollRatioRef.current = maxScroll > 0 ? scrolled / maxScroll : 0;
      // decide whether to maintain based on opts or threshold
      if (typeof opts.maintain === "boolean") {
        maintainScrollRef.current = opts.maintain;
      } else {
        maintainScrollRef.current = scrolled > 100; // maintain if user scrolled down
      }
    } else {
      scrollRatioRef.current = 0;
      maintainScrollRef.current = false;
    }
    setCurrentPage(page);
  };
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [clientFilter, setClientFilter] = useState("all");
  const [dateFilters, setDateFilters] = useState({
    startDate: "",
    endDate: "",
  });
  const [fetchLoading, setFetchLoading] = useState(false);
  const [fetchMessage, setFetchMessage] = useState("");

  const recordsPerPage = 50; // Show 50 records per page

  // Small reusable skeleton row used during fetch or pagination
  const SkeletonRow = ({ compact = false }) => (
    <tr className="opacity-100 animate-pulse">
      <td className="sticky left-0 bg-white px-3 py-3 border-r border-gray-200 z-10">
        <div className="h-3 bg-gray-200 rounded w-20"></div>
      </td>
      <td className="px-3 py-3">
        <div className="h-3 bg-gray-200 rounded w-32" />
      </td>
      <td className="px-3 py-3 whitespace-nowrap">
        <div className="h-3 bg-gray-200 rounded w-24" />
      </td>
      <td className="px-3 py-3 whitespace-nowrap">
        <div className="h-3 bg-gray-200 rounded w-20" />
      </td>
      <td className="px-3 py-3 whitespace-nowrap">
        <div className="h-3 bg-gray-200 rounded w-16" />
      </td>
      <td className="px-3 py-3">
        <div className="h-3 bg-gray-200 rounded w-16" />
      </td>
      <td className="px-3 py-3">
        <div className="h-3 bg-gray-200 rounded w-16" />
      </td>
      <td className="px-3 py-3">
        <div className="h-3 bg-gray-200 rounded w-28" />
      </td>
    </tr>
  );

  // If campaigns prop is passed (from App.jsx filtered by client), use it as a fallback initial load
  useEffect(() => {
    if (campaigns && campaigns.length > 0 && serverRecords.length === 0) {
      const records = campaigns.flatMap((campaign) =>
        campaign.records.map((record) => ({
          ...record,
          campaignName: campaign.campaignName,
          client: campaign.client || "Unknown",
        }))
      );
      setServerRecords(records.slice(0, recordsPerPage));
      setTotalRecords(records.length);
    }
  }, [campaigns]);

  // compute unique clients for dropdown (from current page and fallback campaigns)
  const clientOptions = Array.from(
    new Set(
      serverRecords
        .map((r) => r.client || "Unknown")
        .concat(
          (campaigns || []).map((c) => c.client || "Unknown")
        )
    )
  )
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));

  // When currentPage changes, animate rows and restore scroll position (or scroll to top)
  useEffect(() => {
    const container = tableContainerRef.current;
    setFadeIn(false);
    // small delay to allow DOM update
    const t = setTimeout(() => {
      setFadeIn(true);
      if (container) {
        try {
          if (maintainScrollRef.current) {
            const maxAfter = Math.max(
              0,
              container.scrollHeight - container.clientHeight
            );
            container.scrollTop = Math.round(scrollRatioRef.current * maxAfter);
          } else {
            container.scrollTo({ top: 0, behavior: "smooth" });
          }
        } catch (e) {}
      }
    }, 60);
    return () => clearTimeout(t);
  }, [currentPage]);

  // Server-side pagination: current page records come from serverRecords, totalRecords tracks full count
  const currentRecords = serverRecords;
  const totalPages = Math.max(1, Math.ceil(totalRecords / recordsPerPage));

  const getStatusIcon = (status) => {
    const statusLower = status?.toLowerCase() || "";
    if (["sent", "success", "delivered"].includes(statusLower)) {
      return <CheckCircle className="text-green-500" size={18} />;
    } else if (["failed", "failure", "error"].includes(statusLower)) {
      return <XCircle className="text-red-500" size={18} />;
    }
    return <Minus className="text-gray-400" size={18} />;
  };

  const getStatusBadge = (status) => {
    const statusLower = status?.toLowerCase() || "";
    if (["sent", "success", "delivered"].includes(statusLower)) {
      return (
        <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
          Delivered
        </span>
      );
    } else if (["failed", "failure", "error"].includes(statusLower)) {
      return (
        <span className="px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-800">
          Failed
        </span>
      );
    }
    return (
      <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-800">
        {status || "Unknown"}
      </span>
    );
  };

  // Reset to page 1 when filters change
  useEffect(() => {
    fetchPage(1);
  }, [searchTerm, statusFilter, dateFilters]);

  // Reset when client filter changes as well
  useEffect(() => {
    fetchPage(1);
  }, [clientFilter]);

  // Page input state for 'Go to page'
  const [gotoPageInput, setGotoPageInput] = useState("");
  const [gotoInvalid, setGotoInvalid] = useState(false);

  const handleGoto = () => {
    const n = parseInt(gotoPageInput, 10);
    if (Number.isNaN(n)) return;
    if (n < 1 || n > totalPages) {
      setGotoInvalid(true);
      return;
    }
    const page = n;
    fetchPage(page);
    setGotoPageInput("");
    setGotoInvalid(false);
    try {
      window.localStorage.setItem("dc_records_page", String(page));
    } catch (e) {}
  };

  // Clear invalid state when input changes
  useEffect(() => {
    if (gotoInvalid) setGotoInvalid(false);
  }, [gotoPageInput]);

  // Persist current page to localStorage so session remembers last page
  useEffect(() => {
    try {
      window.localStorage.setItem("dc_records_page", String(currentPage));
    } catch (e) {}
  }, [currentPage]);

  // Fetch a page of records from backend
  async function fetchPage(page = 1) {
    setLoadingPage(true);
    const limit = recordsPerPage;
    const params = new URLSearchParams();
    params.set("limit", String(limit));
    // Use page-based pagination (backend expects page + limit)
    params.set("page", String(page));
    if (clientFilter && clientFilter !== "all")
      params.set("client", clientFilter);
    if (dateFilters.startDate) params.set("startDate", dateFilters.startDate);
    if (dateFilters.endDate) params.set("endDate", dateFilters.endDate);
    if (statusFilter && statusFilter !== "all")
      params.set("status", statusFilter);
    if (searchTerm) params.set("q", searchTerm);

    try {
      // Use the Ringless Voicemail API records endpoint
      const res = await fetch(
        `${API_BASE_URL}/api/dropcowboy/records?${params.toString()}`
      );
      const json = await res.json();
      if (json.success) {
        const rows =
          json.data && Array.isArray(json.data.records)
            ? json.data.records
            : [];
        const total =
          json.data && json.data.pagination
            ? json.data.pagination.totalRecords || rows.length
            : rows.length;

        // Extract metrics from response
        if (json.data && json.data.metrics) {
          setMetrics(json.data.metrics);
        }

        // Normalize DB columns to the shape expected by the table
        const normalized = rows.map((r) => {
          return {
            campaignName: r.campaignName || "",
            client: r.client || "Unknown",
            phoneNumber:
              r.phoneNumber || r.phone_number || r.phone || r.phone_num || "",
            firstName: r.firstName || r.first_name || r.first || "",
            lastName: r.lastName || r.last_name || r.last || "",
            email: r.email || r.email_address || "",
            status: r.status || r.state || "",
            date: r.date || r.created_at || r.timestamp || "",
            __raw: r,
          };
        });

        setServerRecords(normalized);
        setTotalRecords(total || 0);
        setCurrentPage(page);
      } else {
        console.error("Failed to fetch records:", json.error);
      }
    } catch (err) {
      console.error("Error fetching records:", err);
    } finally {
      setLoadingPage(false);
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200">
      {/* Header */}
      <div className="px-6 py-5 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-white">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-gray-900">
            Voicemail Campaign Records
          </h3>
          <button
            onClick={async () => {
              try {
                setFetchLoading(true);
                setFetchMessage("Refreshing data...");
                await fetchPage(currentPage || 1);
                setFetchMessage("Data refreshed successfully");
              } catch (err) {
                setFetchMessage("Error: " + (err.message || "unknown"));
              } finally {
                setFetchLoading(false);
                setTimeout(() => setFetchMessage(""), 3000);
              }
            }}
            disabled={fetchLoading}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed transition-colors shadow-sm"
          >
            {fetchLoading ? (
              <Loader2 className="animate-spin" size={16} />
            ) : (
              "Refresh Data"
            )}
          </button>
        </div>

        {/* All Filters in One Row */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Search Input */}
          <input
            type="text"
            placeholder="Search by phone, name, email, campaign..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 min-w-[250px] px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
          />

          {/* Status Dropdown */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm bg-white"
          >
            <option value="all">All Status</option>
            <option value="success">Delivered</option>
            <option value="failed">Failed</option>
            <option value="other">Other</option>
          </select>

          {/* Client Dropdown */}
          <select
            value={clientFilter}
            onChange={(e) => setClientFilter(e.target.value)}
            className="px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm bg-white"
          >
            <option value="all">All Clients</option>
            {clientOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          {/* Date Range */}
          <input
            type="date"
            value={dateFilters.startDate}
            onChange={(e) =>
              setDateFilters((prev) => ({ ...prev, startDate: e.target.value }))
            }
            className="px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            aria-label="Start date"
          />
          <span className="text-sm text-gray-500 font-medium">to</span>
          <input
            type="date"
            value={dateFilters.endDate}
            onChange={(e) =>
              setDateFilters((prev) => ({ ...prev, endDate: e.target.value }))
            }
            className="px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            aria-label="End date"
          />

          {/* Clear Dates Button */}
          {(dateFilters.startDate || dateFilters.endDate) && (
            <button
              onClick={() => setDateFilters({ startDate: "", endDate: "" })}
              className="px-3 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              title="Clear dates"
            >
              Clear
            </button>
          )}
        </div>

        {/* Stats & Message */}
        <div className="mt-4 flex items-center justify-between">
          <div className="flex flex-wrap gap-4 text-sm text-gray-600">
            {loadingPage ? (
              <>
                <div className="h-4 w-32 bg-gray-200 rounded animate-pulse" />
                <div className="h-4 w-20 bg-gray-200 rounded animate-pulse" />
              </>
            ) : (
              <>
                <span>
                  Total:{" "}
                  <strong className="text-blue-600 font-semibold">
                    {totalRecords.toLocaleString()}
                  </strong>{" "}
                  records
                </span>
                <span className="text-gray-400">•</span>
                <span>
                  Page:{" "}
                  <strong className="text-blue-600 font-semibold">
                    {currentPage}/{totalPages}
                  </strong>
                </span>
                <span className="text-gray-400">•</span>
                <span>
                  Showing:{" "}
                  <strong className="text-blue-600 font-semibold">
                    {currentRecords.length}
                  </strong>{" "}
                  per page
                </span>
              </>
            )}
          </div>
          {fetchMessage && (
            <div className="text-sm text-green-600 font-medium bg-green-50 px-3 py-1 rounded-lg">
              {fetchMessage}
            </div>
          )}
        </div>
      </div>

      {/* Metrics Cards - Filtered Campaign Metrics */}
      <div className="px-6 py-5 bg-gradient-to-r from-blue-50/50 to-indigo-50/50 border-b border-gray-200">
        <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-4">
          Filtered Campaign Metrics
        </h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* Total Voicemails Sent */}
          <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
              Total Voicemails Sent
            </div>
            <div className="text-2xl font-bold text-gray-900">
              {metrics.totalVoicemailsSent.toLocaleString()}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Ringless voicemails
            </div>
          </div>

          {/* Successful Deliveries */}
          <div className="bg-white rounded-lg p-4 shadow-sm border border-green-200 hover:shadow-md transition-shadow">
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
              Successful Deliveries
            </div>
            <div className="text-2xl font-bold text-green-600">
              {metrics.successfulDeliveries.toLocaleString()}
            </div>
            <div className="text-xs text-green-600 font-semibold mt-1">
              {metrics.deliveryRate}% delivery rate
            </div>
          </div>

          {/* Failed Deliveries */}
          <div className="bg-white rounded-lg p-4 shadow-sm border border-red-200 hover:shadow-md transition-shadow">
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
              Failed Deliveries
            </div>
            <div className="text-2xl font-bold text-red-600">
              {metrics.failedDeliveries.toLocaleString()}
            </div>
            <div className="text-xs text-red-600 font-semibold mt-1">
              {metrics.failureRate}% failure rate
            </div>
          </div>

          {/* Other Status */}
          <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
              Other Status
            </div>
            <div className="text-2xl font-bold text-gray-600">
              {metrics.otherStatus.toLocaleString()}
            </div>
            <div className="text-xs text-gray-500 font-semibold mt-1">
              {metrics.otherStatusRate}% other status
            </div>
          </div>
        </div>

        {/* Total Campaign Cost - Only visible to superadmin */}
        {user && user.role === "superadmin" && (
          <div className="mt-4 bg-white rounded-lg p-4 shadow-sm border border-blue-200 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Total Campaign Cost
              </div>
              <div className="text-2xl font-bold text-blue-600">
                ${metrics.totalCampaignCost.toFixed(2)}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Table - vertically scrollable viewport with sticky pagination footer */}
      <div
        className="overflow-x-auto overflow-y-auto max-h-[65vh] relative"
        ref={tableContainerRef}
      >
        {/* Responsive table with optimized column widths */}
        <table className="w-full min-w-max">
          <thead className="bg-gradient-to-r from-gray-50 to-gray-100 border-b-2 border-gray-300">
            <tr>
              <th className="sticky top-0 left-0 bg-gradient-to-r from-gray-50 to-gray-100 px-3 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wide border-r border-gray-200 z-30 min-w-[100px] max-w-[120px]">
                Client
              </th>
              <th className="sticky top-0 bg-gradient-to-r from-gray-50 to-gray-100 px-3 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wide whitespace-nowrap z-20 min-w-[180px] max-w-[200px]">
                Campaign
              </th>
              <th className="sticky top-0 bg-gradient-to-r from-gray-50 to-gray-100 px-3 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wide whitespace-nowrap z-20 min-w-[130px] max-w-[140px]">
                Phone
              </th>
              <th className="sticky top-0 bg-gradient-to-r from-gray-50 to-gray-100 px-3 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wide z-20 min-w-[110px] max-w-[120px]">
                Status
              </th>
              <th className="sticky top-0 bg-gradient-to-r from-gray-50 to-gray-100 px-3 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wide z-20 min-w-[100px] max-w-[110px]">
                Date
              </th>
              <th className="sticky top-0 bg-gradient-to-r from-gray-50 to-gray-100 px-3 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wide whitespace-nowrap z-20 min-w-[100px] max-w-[120px]">
                First Name
              </th>
              <th className="sticky top-0 bg-gradient-to-r from-gray-50 to-gray-100 px-3 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wide whitespace-nowrap z-20 min-w-[100px] max-w-[120px]">
                Last Name
              </th>
              <th className="sticky top-0 bg-gradient-to-r from-gray-50 to-gray-100 px-3 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wide z-20 min-w-[180px] max-w-[220px]">
                Email
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {fetchLoading ? (
              // Skeleton rows while fetch is running
              [...Array(recordsPerPage)].map((_, i) => (
                <SkeletonRow key={`skeleton-fetch-${i}`} />
              ))
            ) : loadingPage ? (
              // Use compact skeletons for pagination transition
              [...Array(Math.min(recordsPerPage, 10))].map((_, i) => (
                <SkeletonRow key={`skeleton-page-${i}`} compact />
              ))
            ) : currentRecords.length === 0 ? (
              <tr>
                <td colSpan="9" className="px-6 py-16 text-center">
                  <div className="text-gray-400 text-sm">
                    <div className="text-4xl mb-2">📭</div>
                    <div className="font-medium">No records found</div>
                    <div className="text-xs mt-1">
                      Try adjusting your filters
                    </div>
                  </div>
                </td>
              </tr>
            ) : (
              currentRecords.map((record, index) => (
                <tr
                  key={index}
                  className={`hover:bg-blue-50/50 transition-all duration-200 ${
                    fadeIn ? "opacity-100" : "opacity-0"
                  } border-b border-gray-100 last:border-0`}
                >
                  <td className="sticky left-0 bg-white hover:bg-blue-50/50 px-3 py-3 border-r border-gray-100 z-10">
                    <div className="flex items-center gap-1.5">
                      <Building2
                        size={13}
                        className="text-gray-400 flex-shrink-0"
                      />
                      <div
                        className="text-xs text-gray-900 font-semibold overflow-hidden truncate"
                        title={record.client}
                      >
                        {record.client || "-"}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <div
                      className="text-xs text-gray-900 font-medium overflow-hidden truncate"
                      title={record.campaignName}
                    >
                      {record.campaignName || "-"}
                    </div>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-1.5 text-xs text-gray-900 font-mono">
                      <Phone
                        size={12}
                        className="text-blue-500 flex-shrink-0"
                      />
                      <span className="overflow-hidden truncate">
                        {record.phoneNumber || "-"}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    {getStatusBadge(record.status)}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-1.5 text-xs text-gray-700">
                      <Clock
                        size={12}
                        className="text-gray-400 flex-shrink-0"
                      />
                      <span className="font-medium">
                        {record.date
                          ? new Date(record.date).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                            })
                          : "-"}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <div
                      className="text-xs text-gray-700 font-medium overflow-hidden truncate"
                      title={record.firstName}
                    >
                      {record.firstName || "-"}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <div
                      className="text-xs text-gray-700 font-medium overflow-hidden truncate"
                      title={record.lastName}
                    >
                      {record.lastName || "-"}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-1.5 text-xs text-gray-600">
                      <Mail size={12} className="text-gray-400 flex-shrink-0" />
                      <span
                        className="overflow-hidden truncate"
                        title={record.email}
                      >
                        {record.email || "-"}
                      </span>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        {/* Sticky pagination footer inside table viewport */}
        {totalRecords > recordsPerPage && (
          <div className="sticky bottom-0 left-0 right-0 bg-gradient-to-r from-gray-50 to-white backdrop-blur-sm border-t-2 border-gray-200 px-6 py-4 flex items-center justify-between z-10 shadow-lg">
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
            <div className="flex items-center gap-2">
              <button
                onClick={() => fetchPage(1)}
                disabled={currentPage === 1}
                className="px-3 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-blue-50 hover:border-blue-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
                title="First Page"
              >
                ««
              </button>

              <button
                onClick={() => fetchPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="px-4 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-blue-50 hover:border-blue-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
              >
                Previous
              </button>

              <div
                className="px-4 py-2 text-sm font-bold text-gray-900 bg-blue-50 border border-blue-200 rounded-lg"
                title={`Total pages: ${totalPages}`}
              >
                Page {currentPage} of {totalPages}
              </div>

              <button
                onClick={() => fetchPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
                className="px-4 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-blue-50 hover:border-blue-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
              >
                Next
              </button>

              <button
                onClick={() => fetchPage(totalPages)}
                disabled={currentPage === totalPages}
                className="px-3 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-blue-50 hover:border-blue-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
                title="Last Page"
              >
                »»
              </button>

              <div className="flex items-center gap-2 ml-3 pl-3 border-l-2 border-gray-300">
                <span className="text-xs text-gray-600 font-medium">
                  Jump to:
                </span>
                <input
                  type="number"
                  min="1"
                  max={totalPages}
                  value={gotoPageInput}
                  onChange={(e) => setGotoPageInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleGoto();
                  }}
                  placeholder="Page #"
                  className={`w-20 px-3 py-2 rounded-lg text-sm font-medium border focus:ring-2 focus:ring-blue-500 ${
                    gotoInvalid
                      ? "border-red-500 ring-1 ring-red-300"
                      : "border-gray-300"
                  }`}
                />
                <button
                  onClick={handleGoto}
                  className="px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
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
};

export default RecordsTable;
