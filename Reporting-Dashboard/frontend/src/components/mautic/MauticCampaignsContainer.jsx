import { useState, useEffect } from "react";
import axios from "axios";
import {
  Mail,
  Eye,
  ChevronDown,
  ChevronRight,
  Send,
  Users,
  Activity,
  TrendingUp,
  BarChart3,
} from "lucide-react";

const MauticCampaignsContainer = ({ clientId }) => {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedCampaignId, setExpandedCampaignId] = useState(null);
  const [showDetails, setShowDetails] = useState({});

  // Use environment variable or default to relative URL for same-origin requests
  const baseUrl = import.meta.env.VITE_API_URL || '';

  useEffect(() => {
    const fetchCampaigns = async () => {
      try {
        const [campaignsRes, segmentsRes, emailsRes] = await Promise.all([
          axios.get(
            `${baseUrl}/api/mautic/clients/${clientId}/campaigns`
          ),
          axios.get(
            `${baseUrl}/api/mautic/clients/${clientId}/segments`
          ),
          axios.get(
            `${baseUrl}/api/mautic/clients/${clientId}/emails`
          ),
        ]);

        const segments = segmentsRes.data.data;
        const emails = emailsRes.data.data;

        const campaignsWithDetails = campaignsRes.data.data.map((c) => {
          // Match emails that belong to this campaign (by name prefix or other logic)
          const campaignEmails = emails.filter((e) =>
            e.name.toLowerCase().includes(c.name.toLowerCase().split(":")[0])
          );

          // For now, we'll show all segments - you can customize this logic
          const campaignSegments = segments;

          return { ...c, emails: campaignEmails, segments: campaignSegments };
        });

        setCampaigns(campaignsWithDetails);
        setLoading(false);
      } catch (err) {
        console.error(err);
        setLoading(false);
      }
    };

    fetchCampaigns();
  }, [clientId]);

  const toggleCampaign = (campaignId) => {
    if (expandedCampaignId === campaignId) {
      setExpandedCampaignId(null);
      setShowDetails({}); // Reset details when closing campaign
    } else {
      setExpandedCampaignId(campaignId);
      setShowDetails({}); // Reset details when opening new campaign
    }
  };

  const toggleDetails = (campaignId) => {
    setShowDetails((prev) => ({
      ...prev,
      [campaignId]: !prev[campaignId],
    }));
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-8">
        <div className="text-gray-500">Loading campaigns...</div>
      </div>
    );
  }

  if (!campaigns.length) {
    return (
      <div className="flex justify-center items-center py-8">
        <div className="text-gray-400">No campaigns found.</div>
      </div>
    );
  }

  // Calculate totals across all campaigns
  const totalSegments = campaigns.reduce(
    (acc, c) => acc + c.segments.length,
    0
  );
  const totalEmails = campaigns.reduce((acc, c) => acc + c.emails.length, 0);
  const totalSent = campaigns.reduce(
    (acc, c) => acc + c.emails.reduce((a, e) => a + e.sentCount, 0),
    0
  );
  const totalRead = campaigns.reduce(
    (acc, c) => acc + c.emails.reduce((a, e) => a + e.readCount, 0),
    0
  );
  const totalReadPercentage = totalSent
    ? ((totalRead / totalSent) * 100).toFixed(2)
    : 0;

  return (
    <div className="bg-gradient-to-br from-white to-gray-50 rounded-xl shadow-lg border border-gray-200 overflow-hidden mt-6">
      <div className="space-y-3 p-6">
        {campaigns.map((campaign) => {
          const campaignSent = campaign.emails.reduce(
            (a, e) => a + e.sentCount,
            0
          );
          const campaignRead = campaign.emails.reduce(
            (a, e) => a + e.readCount,
            0
          );
          const emailsPercentage =
            campaign.emails.length > 0
              ? (campaignSent / campaign.emails.length / 100).toFixed(2)
              : 0;
          const readPercentage = campaignSent
            ? ((campaignRead / campaignSent) * 100).toFixed(2)
            : 0;
          const isExpanded = expandedCampaignId === campaign.id;
          const detailsExpanded = showDetails[campaign.id];

          return (
            <div
              key={campaign.id}
              className="border-2 border-gray-200 rounded-xl overflow-hidden shadow-md hover:shadow-xl transition-all duration-300"
            >
              {/* Campaign Header - Clickable */}
              <div
                onClick={() => toggleCampaign(campaign.id)}
                className="bg-gradient-to-r from-gray-50 to-gray-100 px-6 py-4 cursor-pointer hover:from-blue-50 hover:to-purple-50 transition-all duration-300 flex items-center justify-between group"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`p-2 rounded-lg transition-all duration-300 ${
                      isExpanded
                        ? "bg-blue-200 rotate-0"
                        : "bg-gray-200 -rotate-90"
                    }`}
                  >
                    <ChevronDown
                      className={`w-5 h-5 transition-colors ${
                        isExpanded
                          ? "text-blue-700"
                          : "text-gray-600 group-hover:text-blue-600"
                      }`}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Activity className="w-5 h-5 text-purple-600" />
                    <span className="font-bold text-gray-900 text-lg">
                      {campaign.name}
                    </span>
                  </div>
                  {!campaign.isPublished && (
                    <span className="px-3 py-1 text-xs font-semibold rounded-full bg-amber-100 text-amber-700 border border-amber-300">
                      Unpublished
                    </span>
                  )}
                </div>
                <div
                  className={`px-4 py-2 rounded-lg font-bold ${
                    readPercentage > 75
                      ? "bg-green-100 text-green-800"
                      : readPercentage > 50
                      ? "bg-yellow-100 text-yellow-800"
                      : "bg-red-100 text-red-800"
                  }`}
                >
                  {readPercentage}%
                </div>
              </div>

              {/* Campaign Details - Shown when expanded */}
              {isExpanded && (
                <div className="bg-white">
                  {/* Summary Stats */}
                  <div className="px-6 py-5 border-b border-gray-200 bg-gradient-to-br from-white to-blue-50">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {/* Total Segments */}
                      <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-4 border-2 border-blue-200 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex items-center gap-2 mb-2">
                          <Users className="w-5 h-5 text-blue-600" />
                          <div className="text-xs text-blue-700 font-bold uppercase tracking-wide">
                            Segments
                          </div>
                        </div>
                        <div className="text-3xl font-extrabold text-blue-800">
                          {campaign.segments.length}
                        </div>
                      </div>

                      {/* Total Emails */}
                      <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-4 border-2 border-purple-200 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex items-center gap-2 mb-2">
                          <Mail className="w-5 h-5 text-purple-600" />
                          <div className="text-xs text-purple-700 font-bold uppercase tracking-wide">
                            Emails
                          </div>
                        </div>
                        <div className="text-3xl font-extrabold text-purple-800">
                          {campaign.emails.length}
                        </div>
                      </div>

                      {/* Emails % - Only show if published */}
                      {campaign.isPublished && (
                        <div className="bg-gradient-to-br from-amber-50 to-yellow-100 rounded-xl p-4 border-2 border-yellow-200 shadow-sm hover:shadow-md transition-shadow">
                          <div className="flex items-center gap-2 mb-2">
                            <TrendingUp className="w-5 h-5 text-yellow-600" />
                            <div className="text-xs text-yellow-700 font-bold uppercase tracking-wide">
                              Email Rate
                            </div>
                          </div>
                          <div className="text-3xl font-extrabold text-yellow-800">
                            {emailsPercentage}%
                          </div>
                        </div>
                      )}

                      {/* Read % - Only show if published with colored background */}
                      {campaign.isPublished && (
                        <div
                          className={`rounded-xl p-4 border-2 shadow-sm hover:shadow-md transition-shadow ${
                            readPercentage > 75
                              ? "bg-gradient-to-br from-green-50 to-emerald-100 border-green-300"
                              : readPercentage > 50
                              ? "bg-gradient-to-br from-yellow-50 to-amber-100 border-yellow-300"
                              : "bg-gradient-to-br from-red-50 to-rose-100 border-red-300"
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <Eye
                              className={`w-5 h-5 ${
                                readPercentage > 75
                                  ? "text-green-600"
                                  : readPercentage > 50
                                  ? "text-yellow-600"
                                  : "text-red-600"
                              }`}
                            />
                            <div
                              className={`text-xs font-bold uppercase tracking-wide ${
                                readPercentage > 75
                                  ? "text-green-700"
                                  : readPercentage > 50
                                  ? "text-yellow-700"
                                  : "text-red-700"
                              }`}
                            >
                              Read Rate
                            </div>
                          </div>
                          <div
                            className={`text-3xl font-extrabold ${
                              readPercentage > 75
                                ? "text-green-800"
                                : readPercentage > 50
                                ? "text-yellow-800"
                                : "text-red-800"
                            }`}
                          >
                            {readPercentage}%
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Further Details Toggle */}
                    {campaign.isPublished && (
                      <div className="mt-4">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleDetails(campaign.id);
                          }}
                          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-md hover:shadow-lg transition-all duration-200"
                        >
                          {detailsExpanded ? (
                            <>
                              <ChevronDown className="w-5 h-5" />
                              Hide Details
                            </>
                          ) : (
                            <>
                              <ChevronRight className="w-5 h-5" />
                              Show Sent/Read Details
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Detailed Email Stats - Shown when details expanded */}
                  {detailsExpanded && campaign.isPublished && (
                    <div className="px-6 py-5 bg-gradient-to-br from-gray-50 to-blue-50">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Emails Sent */}
                        <div className="bg-white rounded-xl p-6 border-2 border-blue-300 shadow-lg hover:shadow-xl transition-shadow">
                          <div className="flex items-center gap-3 mb-3">
                            <div className="p-3 bg-blue-100 rounded-lg">
                              <Send className="w-7 h-7 text-blue-600" />
                            </div>
                            <span className="text-lg font-bold text-gray-800">
                              Emails Sent
                            </span>
                          </div>
                          <div className="text-5xl font-extrabold text-blue-600 mb-2">
                            {campaignSent.toLocaleString()}
                          </div>
                          <div className="text-sm text-gray-500 font-medium">
                            Total deliveries
                          </div>
                        </div>

                        {/* Emails Read */}
                        <div className="bg-white rounded-xl p-6 border-2 border-green-300 shadow-lg hover:shadow-xl transition-shadow">
                          <div className="flex items-center gap-3 mb-3">
                            <div className="p-3 bg-green-100 rounded-lg">
                              <Eye className="w-7 h-7 text-green-600" />
                            </div>
                            <span className="text-lg font-bold text-gray-800">
                              Emails Read
                            </span>
                          </div>
                          <div className="text-5xl font-extrabold text-green-600 mb-2">
                            {campaignRead.toLocaleString()}
                          </div>
                          <div className="text-sm text-gray-500 font-medium">
                            Total opens
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Total Summary for All Campaigns */}
        <div className="border-2 border-blue-300 rounded-xl overflow-hidden bg-gradient-to-br from-blue-50 to-purple-50 shadow-xl mt-6">
          <div className="px-6 py-4 bg-gradient-to-r from-blue-600 to-purple-600 border-b-2 border-blue-400">
            <div className="flex items-center gap-3">
              <BarChart3 className="w-7 h-7 text-white" />
              <h3 className="text-xl font-extrabold text-white">
                Total Summary (All Campaigns)
              </h3>
            </div>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
              <div className="bg-white rounded-xl p-4 border-2 border-blue-200 shadow-md hover:shadow-lg transition-shadow">
                <div className="flex items-center gap-2 mb-2">
                  <Activity className="w-4 h-4 text-blue-600" />
                  <div className="text-xs text-blue-700 font-bold uppercase">
                    Campaigns
                  </div>
                </div>
                <div className="text-3xl font-extrabold text-blue-800">
                  {campaigns.length}
                </div>
              </div>
              <div className="bg-white rounded-xl p-4 border-2 border-blue-200 shadow-md hover:shadow-lg transition-shadow">
                <div className="flex items-center gap-2 mb-2">
                  <Users className="w-4 h-4 text-blue-600" />
                  <div className="text-xs text-blue-700 font-bold uppercase">
                    Segments
                  </div>
                </div>
                <div className="text-3xl font-extrabold text-blue-800">
                  {totalSegments}
                </div>
              </div>
              <div className="bg-white rounded-xl p-4 border-2 border-purple-200 shadow-md hover:shadow-lg transition-shadow">
                <div className="flex items-center gap-2 mb-2">
                  <Mail className="w-4 h-4 text-purple-600" />
                  <div className="text-xs text-purple-700 font-bold uppercase">
                    Emails
                  </div>
                </div>
                <div className="text-3xl font-extrabold text-purple-800">
                  {totalEmails}
                </div>
              </div>
              <div className="bg-white rounded-xl p-4 border-2 border-blue-200 shadow-md hover:shadow-lg transition-shadow">
                <div className="flex items-center gap-2 mb-2">
                  <Send className="w-4 h-4 text-blue-600" />
                  <div className="text-xs text-blue-700 font-bold uppercase">
                    Total Sent
                  </div>
                </div>
                <div className="text-3xl font-extrabold text-blue-800">
                  {totalSent.toLocaleString()}
                </div>
              </div>
              <div className="bg-white rounded-xl p-4 border-2 border-green-200 shadow-md hover:shadow-lg transition-shadow">
                <div className="flex items-center gap-2 mb-2">
                  <Eye className="w-4 h-4 text-green-600" />
                  <div className="text-xs text-green-700 font-bold uppercase">
                    Total Read
                  </div>
                </div>
                <div className="text-3xl font-extrabold text-green-800">
                  {totalRead.toLocaleString()}
                </div>
              </div>
            </div>
            <div
              className={`rounded-xl p-6 shadow-lg border-2 transition-all ${
                totalReadPercentage > 75
                  ? "bg-gradient-to-r from-green-100 to-emerald-100 border-green-400"
                  : totalReadPercentage > 50
                  ? "bg-gradient-to-r from-yellow-100 to-amber-100 border-yellow-400"
                  : "bg-gradient-to-r from-red-100 to-rose-100 border-red-400"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={`p-3 rounded-lg ${
                      totalReadPercentage > 75
                        ? "bg-green-200"
                        : totalReadPercentage > 50
                        ? "bg-yellow-200"
                        : "bg-red-200"
                    }`}
                  >
                    <TrendingUp
                      className={`w-7 h-7 ${
                        totalReadPercentage > 75
                          ? "text-green-800"
                          : totalReadPercentage > 50
                          ? "text-yellow-800"
                          : "text-red-800"
                      }`}
                    />
                  </div>
                  <span className="text-xl font-bold text-gray-900">
                    Overall Read Rate
                  </span>
                </div>
                <span
                  className={`text-6xl font-extrabold ${
                    totalReadPercentage > 75
                      ? "text-green-900"
                      : totalReadPercentage > 50
                      ? "text-yellow-900"
                      : "text-red-900"
                  }`}
                >
                  {totalReadPercentage}%
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MauticCampaignsContainer;
