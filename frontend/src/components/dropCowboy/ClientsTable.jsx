import React, { useEffect, useMemo, useRef, useState } from "react";
import MetricsCards from "./MetricsCards";
import useViewLevel from "../../zustand/useViewLevel";
import ExportButton from "../ExportButton";
import dropCowboyService from "../../services/dropCowboy/dropCowboyService";

const RECORDS_PER_PAGE = 50;

const ClientsTable = ({ refreshTick = 0 }) => {
  const { dropcowboy, setDCViewLevel, setDCSelectedCampaign } = useViewLevel();
  const { viewLevel, selectedClient, selectedCampaign } = dropcowboy;

  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFilters, setDateFilters] = useState({ startDate: "", endDate: "" });
  const [appliedDateFilters, setAppliedDateFilters] = useState({ startDate: "", endDate: "" });

  const [campaignSummaries, setCampaignSummaries] = useState([]);
  const [overallMetrics, setOverallMetrics] = useState(null);
  const [campaignRecords, setCampaignRecords] = useState([]);
  const [recordsMetrics, setRecordsMetrics] = useState(null);
  const [recordsPagination, setRecordsPagination] = useState({
    currentPage: 1,
    pageSize: RECORDS_PER_PAGE,
    totalRecords: 0,
    totalPages: 1,
    hasMore: false,
  });

  const [loading, setLoading] = useState(false);
  const [loadingRecords, setLoadingRecords] = useState(false);

  const tableContainerRef = useRef(null);
  const [gotoPageInput, setGotoPageInput] = useState("");
  const [gotoInvalid, setGotoInvalid] = useState(false);

  const metrics = useMemo(() => {
    const source = viewLevel === "campaign" ? recordsMetrics : overallMetrics;

    if (!source) {
      return {
        overall: {
          totalSent: 0,
          successfulDeliveries: 0,
          failedSends: 0,
          otherStatus: 0,
          totalCost: 0,
          averageSuccessRate: 0,
        },
      };
    }

    return {
      overall: {
        totalSent: source.totalSent || 0,
        successfulDeliveries: source.successfulDeliveries || 0,
        failedSends: source.failedSends || 0,
        otherStatus: source.otherStatus || 0,
        totalCost: source.totalCost || 0,
        averageSuccessRate: source.avgSuccessRate || source.averageSuccessRate || 0,
      },
    };
  }, [overallMetrics, recordsMetrics, viewLevel]);

  useEffect(() => {
    if (!selectedClient) return;

    const fetchSummaries = async () => {
      setLoading(true);
      const result = await dropCowboyService.getClientCampaigns(selectedClient, {
        ...appliedDateFilters,
        noCache: refreshTick > 0,
      });
      if (result.success) {
        setCampaignSummaries(result.data || []);
        setOverallMetrics(
          result.overall || {
            totalSent: 0,
            successfulDeliveries: 0,
            failedSends: 0,
            otherStatus: 0,
            totalCost: 0,
            avgSuccessRate: 0,
          }
        );
      }
      setLoading(false);
    };

    fetchSummaries();
  }, [selectedClient, appliedDateFilters, refreshTick]);

  useEffect(() => {
    if (viewLevel !== "campaign" || !selectedClient || !selectedCampaign) return;

    const campaign = campaignSummaries.find((c) => c.campaignName === selectedCampaign);
    if (!campaign?.campaignId) return;

    const fetchRecords = async () => {
      setLoadingRecords(true);
      const result = await dropCowboyService.getClientCampaignRecords(selectedClient, campaign.campaignId, {
        page: recordsPagination.currentPage,
        limit: RECORDS_PER_PAGE,
        startDate: appliedDateFilters.startDate,
        endDate: appliedDateFilters.endDate,
        status: statusFilter,
        noCache: refreshTick > 0,
      });

      if (result.success) {
        setCampaignRecords(result.data?.records || []);
        setRecordsMetrics(result.data?.metrics || null);
        setRecordsPagination(
          result.data?.pagination || {
            currentPage: 1,
            pageSize: RECORDS_PER_PAGE,
            totalRecords: 0,
            totalPages: 1,
            hasMore: false,
          }
        );
      }

      setLoadingRecords(false);
    };

    fetchRecords();
  }, [
    viewLevel,
    selectedClient,
    selectedCampaign,
    campaignSummaries,
    appliedDateFilters,
    statusFilter,
    recordsPagination.currentPage,
    refreshTick,
  ]);

  useEffect(() => {
    setRecordsPagination((prev) => ({ ...prev, currentPage: 1 }));
  }, [selectedCampaign, statusFilter, appliedDateFilters]);

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

  const handleGoto = () => {
    const n = parseInt(gotoPageInput, 10);
    if (Number.isNaN(n) || n < 1 || n > recordsPagination.totalPages) {
      setGotoInvalid(true);
      return;
    }
    setRecordsPagination((prev) => ({ ...prev, currentPage: n }));
    setGotoPageInput("");
    setGotoInvalid(false);
  };

  // Build export rows from the same view model used by the visible table.
  const exportConfig = useMemo(() => {
    if (viewLevel === "client") {
      return {
        data: campaignSummaries.map((row) => ({
          campaign: row.campaignName,
          totalVoicemailsSent: row.totalSent,
          success: row.successfulDeliveries,
          failure: row.failedSends,
          other: row.otherStatus,
          cost: row.totalCost,
        })),
        filename: "voicemail_campaign_summary",
        title: "Voicemail Campaign Summary",
        columns: {
          campaign: "Campaign",
          totalVoicemailsSent: "Total Voicemails sent",
          success: "Success",
          failure: "Failure",
          other: "Other",
          cost: "Cost",
        },
      };
    }

    if (viewLevel === "campaign") {
      return {
        data: campaignRecords.map((record) => ({
          phoneNumber: record.phoneNumber || "",
          status: record.status || "",
          date: record.date || "",
          firstName: record.firstName || "",
          lastName: record.lastName || "",
          email: record.email || "",
        })),
        filename: "voicemail_campaign_records",
        title: "Voicemail Campaign Records",
        columns: {
          phoneNumber: "Phone",
          status: "Status",
          date: "Date",
          firstName: "First Name",
          lastName: "Last Name",
          email: "Email",
        },
      };
    }

    return { data: [], filename: "voicemail", title: "Voicemail", columns: {} };
  }, [
    campaignSummaries,
    campaignRecords,
    viewLevel,
  ]);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200">
      {/* Header */}
      <div className="px-6 py-5 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-white">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-gray-900">
            Voicemail Campaign Records
          </h3>
          <div className="flex items-center gap-2">
            <ExportButton
              data={exportConfig.data}
              filename={exportConfig.filename}
              title={exportConfig.title}
              columns={exportConfig.columns}
              campaignType="voicemail"
              variant="secondary"
              disabled={exportConfig.data.length === 0}
            />
          </div>
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
            setStatusFilter(status);
            setRecordsPagination((prev) => ({ ...prev, currentPage: 1 }));
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
              {viewLevel === "client" && (
                <span>Client: {selectedClient}</span>
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
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-700">
                      Cost
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
                {(loading || loadingRecords) && (
                  <tr>
                    <td colSpan="6" className="py-12 text-center text-gray-500">Loading...</td>
                  </tr>
                )}

                {!loading && !loadingRecords && viewLevel === "client" && campaignSummaries.length === 0 && (
                  <tr>
                    <td colSpan="6" className="py-12 text-center text-gray-400">No campaigns found</td>
                  </tr>
                )}

                {!loading && !loadingRecords && viewLevel === "client" && campaignSummaries.map((campaign) => (
                  <tr
                    key={campaign.campaignId}
                    className="hover:bg-blue-50 cursor-pointer transition-all"
                    onClick={() => {
                      setDCSelectedCampaign(campaign.campaignName);
                      setDCViewLevel("campaign");
                    }}
                  >
                    <td className="px-4 py-3 font-medium">{campaign.campaignName}</td>
                    <td className="px-4 py-3">{campaign.totalSent}</td>
                    <td className="px-4 py-3">{campaign.successfulDeliveries}</td>
                    <td className="px-4 py-3">{campaign.failedSends}</td>
                    <td className="px-4 py-3">{campaign.otherStatus}</td>
                    <td className="px-4 py-3">${(campaign.totalCost || 0).toFixed(4)}</td>
                  </tr>
                ))}

                {!loading && !loadingRecords && viewLevel === "campaign" && campaignRecords.length === 0 && (
                  <tr>
                    <td colSpan="6" className="py-12 text-center text-gray-400">No records found</td>
                  </tr>
                )}

                {!loading && !loadingRecords && viewLevel === "campaign" && campaignRecords.map((record) => (
                  <tr key={record.id} className="hover:bg-blue-50 transition-all">
                    <td className="px-4 py-3">{record.phoneNumber}</td>
                    <td className="px-4 py-3">{getStatusBadge(record.status)}</td>
                    <td className="px-4 py-3">
                      {record.date
                        ? new Date(record.date).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })
                        : "-"}
                    </td>
                    <td className="px-4 py-3">{record.firstName}</td>
                    <td className="px-4 py-3">{record.lastName}</td>
                    <td className="px-4 py-3">{record.email}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {viewLevel === "campaign" && recordsPagination.totalRecords > 0 && (
          <div className="sticky bottom-0 left-0 right-0 bg-gradient-to-r from-gray-50 to-white backdrop-blur-sm border-t-2 border-gray-200 px-6 py-4 flex items-center justify-between z-10 shadow-lg">
            <div className="text-sm text-gray-700 font-medium">
              Showing{" "}
              <span className="font-bold text-blue-600">
                {(recordsPagination.currentPage - 1) * recordsPagination.pageSize + 1}
              </span>{" "}
              to{" "}
              <span className="font-bold text-blue-600">
                {Math.min(recordsPagination.currentPage * recordsPagination.pageSize, recordsPagination.totalRecords)}
              </span>{" "}
              of{" "}
              <span className="font-bold text-blue-600">
                {recordsPagination.totalRecords}
              </span>{" "}
              records
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setRecordsPagination((prev) => ({ ...prev, currentPage: 1 }))}
                disabled={recordsPagination.currentPage === 1}
                className="px-3 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-blue-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
                title="First Page"
              >
                ««
              </button>

              <button
                onClick={() =>
                  setRecordsPagination((prev) => ({
                    ...prev,
                    currentPage: Math.max(1, prev.currentPage - 1),
                  }))
                }
                disabled={recordsPagination.currentPage === 1}
                className="px-4 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-blue-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
              >
                Previous
              </button>

              <div
                className="px-4 py-2 text-sm font-bold text-gray-900 bg-blue-50 border border-blue-200 rounded-lg"
                title={`Total pages: ${recordsPagination.totalPages}`}
              >
                Page {recordsPagination.currentPage} of {recordsPagination.totalPages}
              </div>

              <button
                onClick={() =>
                  setRecordsPagination((prev) => ({
                    ...prev,
                    currentPage: Math.min(prev.totalPages, prev.currentPage + 1),
                  }))
                }
                disabled={recordsPagination.currentPage === recordsPagination.totalPages}
                className="px-4 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-blue-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
              >
                Next
              </button>

              <button
                onClick={() => setRecordsPagination((prev) => ({ ...prev, currentPage: prev.totalPages }))}
                disabled={recordsPagination.currentPage === recordsPagination.totalPages}
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
                  max={recordsPagination.totalPages}
                  value={gotoPageInput}
                  onChange={(e) => {
                    setGotoPageInput(e.target.value);
                    if (gotoInvalid) setGotoInvalid(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleGoto();
                  }}
                  placeholder="Page #"
                  className={`w-20 px-3 py-2 rounded-lg text-sm border ${gotoInvalid ? "border-red-500" : "border-gray-300"}`}
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
