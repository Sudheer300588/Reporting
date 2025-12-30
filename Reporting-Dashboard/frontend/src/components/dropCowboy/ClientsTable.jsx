import React, { useState, useEffect, useRef, useMemo } from "react";
import { Loader2 } from "lucide-react";
import MetricsCards from "./MetricsCards";
import useViewLevel from "../../zustand/useViewLevel";


const ClientsTable = () => {
  const [serverRecords, setServerRecords] = useState([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [loadingPage, setLoadingPage] = useState(false);

  const { dropcowboy, setDCViewLevel, setDCSelectedClient, setDCSelectedCampaign } = useViewLevel();
  const { viewLevel, selectedClient, selectedCampaign, campaigns } = dropcowboy;

  const groupBy = (arr, keyFn) =>
    arr.reduce((acc, item) => {
      const key = keyFn(item);
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    }, {});

  // Refs to capture/restore scroll ratio when changing pages
  const tableContainerRef = useRef(null);
  const scrollRatioRef = useRef(0);
  const maintainScrollRef = useRef(false);
  const [fadeIn, setFadeIn] = useState(true);

  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFilters, setDateFilters] = useState({
    startDate: "",
    endDate: "",
  });
  const [appliedDateFilters, setAppliedDateFilters] = useState({
    startDate: "",
    endDate: "",
  });
  const [fetchLoading, setFetchLoading] = useState(false);
  const [fetchMessage, setFetchMessage] = useState("");
  const [allRecords, setAllRecords] = useState([]);

  const [currentPage, setCurrentPage] = useState(1);
  const [recordsPerPage] = useState(50);
  const [paginatedRecords, setPaginatedRecords] = useState([]);
  const [totalPages, setTotalPages] = useState(1);

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
    if (campaigns && campaigns.length > 0) {
      const records = campaigns.flatMap((c) => {
        const clientName = c.client || "Unknown";
        const campaign = c.campaignName || "";

        return c.records.map((record) => ({
          ...record,
          client: clientName,
          campaign: campaign.trim(),
          status: record.status?.trim()?.toLowerCase() || "other",
        }));
      });

      const filtered = selectedClient
        ? records.filter((r) => r.client === selectedClient) // selectedClient here is actually selectedClient's name
        : records;

      setAllRecords(filtered);
      console.log(selectedClient);

      setTotalRecords(filtered.length);
      console.log(campaigns);

    }
  }, [campaigns]);

  useEffect(() => {
    const offset = (currentPage - 1) * recordsPerPage;
    setServerRecords(allRecords.slice(offset, offset + recordsPerPage));
  }, [allRecords, currentPage, recordsPerPage]);

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
        } catch (e) { }
      }
    }, 60);
    return () => clearTimeout(t);
  }, [currentPage]);

  // Server-side pagination: current page records come from serverRecords, totalRecords tracks full count
  const currentRecords = serverRecords;

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
    setCurrentPage(gotoPageInput);
    setGotoPageInput("");
    setGotoInvalid(false);
    try {
      window.localStorage.setItem("dc_records_page", String(page));
    } catch (e) { }
  };

  // Clear invalid state when input changes
  useEffect(() => {
    if (gotoInvalid) setGotoInvalid(false);
  }, [gotoPageInput]);

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedCampaign]);

  // 🔹 Filters applied to metrics (no status filter)
  const filteredRecordsForMetrics = useMemo(() => {
    let records = allRecords;

    // View-level filtering
    if (viewLevel === "client" && selectedClient) {
      records = records.filter((r) => r.client === selectedClient);
    } else if (viewLevel === "campaign" && selectedClient && selectedCampaign) {
      records = records.filter(
        (r) => r.client === selectedClient && r.campaignName === selectedCampaign
      );
    }

    // Date filtering (applied only after Save)
    if (appliedDateFilters.startDate || appliedDateFilters.endDate) {
      records = records.filter((r) => {
        const recordDate = new Date(r.date);
        if (
          appliedDateFilters.startDate &&
          recordDate < new Date(appliedDateFilters.startDate)
        )
          return false;
        if (
          appliedDateFilters.endDate &&
          recordDate > new Date(appliedDateFilters.endDate)
        )
          return false;
        return true;
      });
    }

    return records;
  }, [allRecords, viewLevel, selectedClient, selectedCampaign, appliedDateFilters]);

  // 🔹 Filters applied to table (includes status)
  const filteredRecordsForTable = useMemo(() => {
    let records = filteredRecordsForMetrics;

    // Apply status filtering separately
    if (statusFilter !== "all") {
      if (statusFilter === "other") {
        records = records.filter(
          (r) => !["success", "failure"].includes(r.status)
        );
      } else {
        records = records.filter((r) => r.status === statusFilter);
      }
    }

    return records;
  }, [filteredRecordsForMetrics, statusFilter]);

  const metrics = useMemo(() => {
    const totalSent = filteredRecordsForMetrics.length;
    const successfulDeliveries = filteredRecordsForMetrics.filter(
      (r) => r.status === "success"
    ).length;
    const failedSends = filteredRecordsForMetrics.filter(
      (r) => r.status === "failure"
    ).length;
    const otherStatus = filteredRecordsForMetrics.filter(
      (r) => !["success", "failure"].includes(r.status)
    ).length;

    return {
      overall: {
        totalSent,
        successfulDeliveries,
        failedSends,
        otherStatus,
        averageSuccessRate:
          totalSent > 0 ? (successfulDeliveries / totalSent) * 100 : 0,
      },
    };
  }, [filteredRecordsForMetrics]);

  useEffect(() => {
    if (!selectedClient || !selectedCampaign || allRecords.length === 0) return;

    // 1️⃣ Filter the records for the selected client + campaign
    const campaignRecords = filteredRecordsForTable.filter(
      (r) => r.client === selectedClient && r.campaignName === selectedCampaign
    );

    // 2️⃣ Pagination logic
    const startIndex = (currentPage - 1) * recordsPerPage;
    const endIndex = startIndex + recordsPerPage;

    setPaginatedRecords(campaignRecords.slice(startIndex, endIndex));
    setTotalPages(Math.ceil(campaignRecords.length / recordsPerPage));
  }, [selectedClient, selectedCampaign, currentPage, filteredRecordsForTable]);

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
                // await fetchPage(currentPage || 1);
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
        {viewLevel !== "root" && (
          <div className="flex items-center gap-3 flex-wrap">
            {/* Start Date */}
            <input
              type="date"
              value={dateFilters.startDate}
              onChange={(e) =>
                setDateFilters((prev) => ({
                  ...prev,
                  startDate: e.target.value,
                }))
              }
              className="px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              aria-label="Start date"
              title="From date"
            />

            <span className="text-sm text-gray-500 font-medium">to</span>

            {/* End Date */}
            <input
              type="date"
              value={dateFilters.endDate}
              onChange={(e) =>
                setDateFilters((prev) => ({
                  ...prev,
                  endDate: e.target.value,
                }))
              }
              className="px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              aria-label="End date"
              title="To date"
            />

            {/* Save Button */}
            <button
              onClick={() =>
                setAppliedDateFilters({
                  startDate: dateFilters.startDate,
                  endDate: dateFilters.endDate,
                })
              }
              className="px-3 py-2.5 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              title="Apply date filter"
            >
              Save
            </button>

            {/* Clear Button */}
            <button
              onClick={() => {
                setDateFilters({ startDate: "", endDate: "" });
                setAppliedDateFilters({ startDate: "", endDate: "" });
              }}
              className="px-3 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              title="Clear date filter"
            >
              Clear
            </button>
          </div>
        )}

      </div>

      <MetricsCards
        metrics={metrics}
        onMetricClick={(status) => {
          if (viewLevel === "campaign") {
            // Apply status filter for leaf node view
            setStatusFilter(status);
            setCurrentPage(1);
          }
        }}
        viewLevel={viewLevel}
      />

      {/* Table - vertically scrollable viewport with sticky pagination footer */}
      <div
        className="overflow-x-auto overflow-y-auto relative"
        ref={tableContainerRef}
      >
        {/* Hierarchical Table Section */}
        <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm bg-white">
          {/* Drilldown Header / Breadcrumb */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-600">
              {viewLevel === "root" && <span>📊 All Clients</span>}
              {viewLevel === "client" && (
                <>
                  <span>Client: {selectedClient}</span>
                </>
              )}
              {viewLevel === "campaign" && (
                <>
                  <button
                    onClick={() => {
                      setDCViewLevel("client");
                      setDCSelectedCampaign(null);
                    }}
                    className="text-blue-600 hover:underline"
                  >
                    ← Back
                  </button>
                  <span>/ Campaign: {selectedCampaign}</span>
                </>
              )}
            </div>
          </div>

          {/* Table */}
          <div className="max-h-[500px] overflow-y-auto">
            <table className="w-full min-w-max border-collapse">
              <thead className="bg-gradient-to-r from-gray-50 to-gray-100 border-b-2 border-gray-300 sticky top-0 z-30">
                {viewLevel === "root" && (
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-700">
                      Client
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-700">
                      Total Campaigns
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-700">
                      Total Voicemails sent
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-700">
                      Success
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-700">
                      Failure
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-700">
                      Other
                    </th>
                  </tr>
                )}

                {viewLevel === "client" && (
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-700">
                      Campaign
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-700">
                      Total Voicemails sent
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-700">
                      Success
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-700">
                      Failure
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-700">
                      Other
                    </th>
                  </tr>
                )}

                {viewLevel === "campaign" && (
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-700">
                      Phone
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-700">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-700">
                      Date
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-700">
                      First Name
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-700">
                      Last Name
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-700">
                      Email
                    </th>
                  </tr>
                )}
              </thead>

              <tbody className="divide-y divide-gray-100 text-sm text-gray-700">
                {(() => {
                  if (fetchLoading || loadingPage) {
                    return [...Array(recordsPerPage)].map((_, i) => (
                      <SkeletonRow key={i} />
                    ));
                  }

                  if (!currentRecords?.length) {
                    return (
                      <tr>
                        <td
                          colSpan="6"
                          className="py-16 text-center text-gray-400 text-sm"
                        >
                          📭 No records found
                        </td>
                      </tr>
                    );
                  }

                  // Root Level → Group by Client
                  if (viewLevel === "root") {
                    const clientGroups = groupBy(
                      allRecords,
                      (r) => (r.client && r.client.trim()) || "Unknown Client"
                    );
                    return Object.entries(clientGroups).map(
                      ([client, records]) => {
                        const total = records.length;
                        const success = records.filter(
                          (r) => r.status?.toLowerCase() === "success"
                        ).length;
                        const failed = records.filter(
                          (r) => r.status?.toLowerCase() === "failure"
                        ).length;
                        const other = records.filter(
                          (r) => !["success", "failure"].includes(r.status)
                        ).length;

                        return (
                          <tr
                            key={client}
                            className="hover:bg-blue-50 cursor-pointer transition-all"
                            onClick={() => {
                              setDCSelectedClient(client);
                              setDCViewLevel("client");
                            }}
                          >
                            <td className="px-4 py-3 font-semibold text-gray-800">
                              {client}
                            </td>
                            <td className="px-4 py-3">
                              {new Set(records.map((r) => r.campaignId)).size}
                            </td>
                            <td className="px-4 py-3">{total}</td>
                            <td className="px-4 py-3">{success}</td>
                            <td className="px-4 py-3">{failed}</td>
                            <td className="px-4 py-3">{other}</td>
                          </tr>
                        );
                      }
                    );
                  }

                  // Client Level → Group by Campaign
                  if (viewLevel === "client" && selectedClient) {
                    const campaignGroups = groupBy(
                      filteredRecordsForTable,
                      (r) => r.campaignName || "Unknown Campaign"
                    );

                    return Object.entries(campaignGroups).map(
                      ([campaign, records]) => {
                        const total = records.length;
                        const success = records.filter(
                          (r) => r.status?.toLowerCase() === "success"
                        ).length;
                        const failed = records.filter(
                          (r) => r.status?.toLowerCase() === "failure"
                        ).length;
                        const other = records.filter(
                          (r) => !["success", "failure"].includes(r.status)
                        ).length;

                        return (
                          <tr
                            key={campaign}
                            className="hover:bg-blue-50 cursor-pointer transition-all"
                            onClick={() => {
                              setDCSelectedCampaign(campaign);
                              setDCViewLevel("campaign");
                              // fetchPage(1, campaign)
                            }}
                          >
                            <td className="px-4 py-3 font-medium">{campaign}</td>
                            <td className="px-4 py-3">{total}</td>
                            <td className="px-4 py-3">{success}</td>
                            <td className="px-4 py-3">{failed}</td>
                            <td className="px-4 py-3">{other}</td>
                          </tr>
                        );
                      }
                    );
                  }

                  // Campaign Level → Show individual records
                  if (viewLevel === "campaign" && selectedCampaign) {
                    // Update total pages dynamically based on filtered results
                    const totalFilteredPages = Math.ceil(
                      filteredRecordsForTable.length / recordsPerPage
                    );

                    // Ensure current page is valid (in case filters reduce total pages)
                    const safePage = Math.min(
                      currentPage,
                      totalFilteredPages || 1
                    );
                    if (safePage !== currentPage) setCurrentPage(safePage);

                    const paginatedRecords = filteredRecordsForTable.slice(
                      (safePage - 1) * recordsPerPage,
                      safePage * recordsPerPage
                    );

                    return paginatedRecords.map((record, i) => (
                      <tr
                        key={i}
                        className="hover:bg-blue-50 cursor-pointer transition-all"
                      >
                        <td className="px-4 py-3">{record.phoneNumber}</td>
                        <td className="px-4 py-3">
                          {getStatusBadge(record.status)}
                        </td>
                        <td className="px-4 py-3">
                          {new Date(record.date).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric'
                          })}
                        </td>
                        <td className="px-4 py-3">{record.firstName}</td>
                        <td className="px-4 py-3">{record.lastName}</td>
                        <td className="px-4 py-3">{record.email}</td>
                      </tr>
                    ));
                  }
                })()}
              </tbody>
            </table>
          </div>
        </div>

        {/* Sticky pagination footer inside table viewport */}
        {viewLevel === "campaign" && paginatedRecords.length > 0 && (
          <div className="sticky bottom-0 left-0 right-0 bg-gradient-to-r from-gray-50 to-white backdrop-blur-sm border-t-2 border-gray-200 px-6 py-4 flex items-center justify-between z-10 shadow-lg">
            <div className="text-sm text-gray-700 font-medium">
              Showing{" "}
              <span className="font-bold text-blue-600">
                {(currentPage - 1) * recordsPerPage + 1}
              </span>{" "}
              to{" "}
              <span className="font-bold text-blue-600">
                {Math.min(currentPage * recordsPerPage, filteredRecordsForTable.length)}
              </span>{" "}
              of{" "}
              <span className="font-bold text-blue-600">
                {filteredRecordsForTable.length}
              </span>{" "}
              records
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                className="px-3 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-blue-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
                title="First Page"
              >
                ««
              </button>

              <button
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="px-4 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-blue-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
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
                onClick={() =>
                  setCurrentPage(Math.min(totalPages, currentPage + 1))
                }
                disabled={currentPage === totalPages}
                className="px-4 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-blue-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
              >
                Next
              </button>

              <button
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
                className="px-3 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-blue-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
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
                  className={`w-20 px-3 py-2 rounded-lg text-sm font-medium border focus:ring-2 focus:ring-blue-500 ${gotoInvalid
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

export default ClientsTable;
