import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Phone, CheckCircle2, XCircle, Calendar, DollarSign, ChevronLeft, ChevronRight, Info } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { useAuth } from '../../contexts/AuthContext';

const CampaignTable = ({ campaigns }) => {
  const { user } = useAuth();
  const [expandedCampaign, setExpandedCampaign] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [recordPages, setRecordPages] = useState({});
  
  const CAMPAIGNS_PER_PAGE = 5;
  const RECORDS_PER_PAGE = 10;

  if (!campaigns || campaigns.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200/60 p-12 text-center">
        <Phone className="mx-auto mb-3 text-gray-300" size={40} />
        <p className="text-sm text-gray-500 font-medium">No campaign data available</p>
      </div>
    );
  }

  // Pagination calculations for campaigns
  const totalPages = Math.ceil(campaigns.length / CAMPAIGNS_PER_PAGE);
  const startIndex = (currentPage - 1) * CAMPAIGNS_PER_PAGE;
  const endIndex = startIndex + CAMPAIGNS_PER_PAGE;
  const paginatedCampaigns = campaigns.slice(startIndex, endIndex);

  const toggleExpand = (campaignName) => {
    setExpandedCampaign(expandedCampaign === campaignName ? null : campaignName);
    if (!recordPages[campaignName]) {
      setRecordPages({ ...recordPages, [campaignName]: 1 });
    }
  };

  const handlePageChange = (page) => {
    setCurrentPage(page);
    setExpandedCampaign(null); // Close expanded campaign when changing pages
  };

  const handleRecordPageChange = (campaignName, page) => {
    setRecordPages({ ...recordPages, [campaignName]: page });
  };

  const getStatusBadge = (status) => {
    // Handle empty, null, or undefined status
    if (!status || status.trim() === '') {
      return <span className="inline-flex items-center px-2 py-0.5 text-xs font-bold rounded-md bg-gray-100 text-gray-600 border border-gray-200">UNKNOWN</span>;
    }
    
    const statusLower = status.toLowerCase();
    if (statusLower === 'sent' || statusLower === 'success' || statusLower === 'delivered') {
      return <span className="inline-flex items-center px-2 py-0.5 text-xs font-bold rounded-md bg-green-50 text-green-700 border border-green-200">SENT</span>;
    } else if (statusLower === 'failed' || statusLower === 'failure' || statusLower === 'error') {
      return <span className="inline-flex items-center px-2 py-0.5 text-xs font-bold rounded-md bg-red-50 text-red-700 border border-red-200">FAILED</span>;
    } else {
      return <span className="inline-flex items-center px-2 py-0.5 text-xs font-bold rounded-md bg-gray-100 text-gray-700 border border-gray-200">{status.toUpperCase()}</span>;
    }
  };

  // Pagination component
  const Pagination = ({ currentPage, totalPages, onPageChange }) => {
    const pages = [];
    const maxVisiblePages = 5;
    
    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
    
    if (endPage - startPage < maxVisiblePages - 1) {
      startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }
    
    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }

    return (
      <div className="flex items-center justify-between px-5 py-3.5 border-t border-gray-200/60 bg-gray-50/40">
        <div className="text-xs text-gray-600 font-medium">
          {startIndex + 1}–{Math.min(endIndex, campaigns.length)} of {campaigns.length} campaigns
        </div>
        
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className={`p-2 rounded-lg border transition-colors ${
              currentPage === 1
                ? 'border-gray-200 text-gray-300 cursor-not-allowed bg-gray-50'
                : 'border-gray-300 text-gray-700 hover:bg-white hover:border-gray-400'
            }`}
          >
            <ChevronLeft size={16} strokeWidth={2.5} />
          </button>
          
          {startPage > 1 && (
            <>
              <button
                onClick={() => onPageChange(1)}
                className="px-3 py-1.5 rounded-lg border border-gray-300 text-xs font-bold text-gray-700 hover:bg-white hover:border-gray-400 transition-colors"
              >
                1
              </button>
              {startPage > 2 && <span className="text-gray-400 px-1">...</span>}
            </>
          )}
          
          {pages.map((page) => (
            <button
              key={page}
              onClick={() => onPageChange(page)}
              className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition-colors ${
                page === currentPage
                  ? 'border-blue-500 bg-blue-600 text-white shadow-sm'
                  : 'border-gray-300 text-gray-700 hover:bg-white hover:border-gray-400'
              }`}
            >
              {page}
            </button>
          ))}
          
          {endPage < totalPages && (
            <>
              {endPage < totalPages - 1 && <span className="text-gray-400 px-1">...</span>}
              <button
                onClick={() => onPageChange(totalPages)}
                className="px-3 py-1.5 rounded-lg border border-gray-300 text-xs font-bold text-gray-700 hover:bg-white hover:border-gray-400 transition-colors"
              >
                {totalPages}
              </button>
            </>
          )}
          
          <button
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            className={`p-2 rounded-lg border transition-colors ${
              currentPage === totalPages
                ? 'border-gray-200 text-gray-300 cursor-not-allowed bg-gray-50'
                : 'border-gray-300 text-gray-700 hover:bg-white hover:border-gray-400'
            }`}
          >
            <ChevronRight size={16} strokeWidth={2.5} />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Campaigns</h2>
        <div className="text-xs font-semibold text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full">
          {campaigns.length} total
        </div>
      </div>
      
      <div className="bg-white rounded-xl border border-gray-200/60 overflow-hidden">
        <div className="space-y-0 divide-y divide-gray-200/60">
          {paginatedCampaigns.map((campaign) => {
            const recordPage = recordPages[campaign.campaignName] || 1;
            const totalRecordPages = Math.ceil((campaign.records?.length || 0) / RECORDS_PER_PAGE);
            const recordStartIndex = (recordPage - 1) * RECORDS_PER_PAGE;
            const recordEndIndex = recordStartIndex + RECORDS_PER_PAGE;
            const paginatedRecords = campaign.records?.slice(recordStartIndex, recordEndIndex) || [];
            
            return (
          <div key={campaign.campaignName} className="overflow-hidden">
            {/* Campaign Card */}
            <button
              onClick={() => toggleExpand(campaign.campaignName)}
              className="w-full px-5 py-4 text-left hover:bg-gray-50/60 transition-all group"
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2.5 mb-3">
                    <div className="p-1.5 bg-blue-50 rounded-lg border border-blue-100">
                      <Phone className="text-blue-600" size={16} strokeWidth={2.5} />
                    </div>
                    <h3 className="text-sm font-bold text-gray-900">{campaign.campaignName}</h3>
                  </div>
                  
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    <div>
                      <p className="text-xs text-gray-500 font-semibold mb-1">Voicemail</p>
                      <p className="text-xs font-bold text-purple-600 truncate" title={campaign.voicemailName}>
                        {campaign.voicemailName || 'Default VM'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 font-semibold mb-1">Total Sent</p>
                      <p className="text-base font-bold text-gray-900">{campaign.totalSent.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 font-semibold mb-1">Successful</p>
                      <p className="text-base font-bold text-green-600">{campaign.successfulDeliveries.toLocaleString()}</p>
                      <p className="text-xs text-gray-500 font-medium">{campaign.successRate}% rate</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 font-semibold mb-1">Failed</p>
                      <p className="text-base font-bold text-red-600">{campaign.failedSends.toLocaleString()}</p>
                      <p className="text-xs text-gray-500 font-medium">{((campaign.failedSends / campaign.totalSent) * 100 || 0).toFixed(1)}%</p>
                    </div>
                    {user && user.role === 'superadmin' && (
                      <div>
                        <p className="text-xs text-gray-500 font-semibold mb-1">Total Cost</p>
                        <p className="text-base font-bold text-gray-900">${campaign.totalCost.toFixed(2)}</p>
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="ml-4 p-2 rounded-lg group-hover:bg-gray-100 transition-colors">
                  {expandedCampaign === campaign.campaignName ? (
                    <ChevronUp className="text-gray-500" size={18} strokeWidth={2.5} />
                  ) : (
                    <ChevronDown className="text-gray-400" size={18} strokeWidth={2.5} />
                  )}
                </div>
              </div>
            </button>

            {/* Expanded Details */}
            {expandedCampaign === campaign.campaignName && (
              <div className="border-t border-gray-200/60 bg-gray-50/30 px-5 py-4">
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Call Details</h4>
                
                {campaign.records && campaign.records.length > 0 ? (
                  <>
                    <div className="overflow-x-auto bg-white rounded-lg border border-gray-200/60">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gray-50/50 border-b border-gray-200">
                            <th className="text-left py-2.5 px-3 text-xs font-bold text-gray-600 uppercase tracking-wide">Phone</th>
                            <th className="text-left py-2.5 px-3 text-xs font-bold text-gray-600 uppercase tracking-wide">Name</th>
                            <th className="text-left py-2.5 px-3 text-xs font-bold text-gray-600 uppercase tracking-wide">Email</th>
                            <th className="text-left py-2.5 px-3 text-xs font-bold text-gray-600 uppercase tracking-wide">Carrier</th>
                            <th className="text-left py-2.5 px-3 text-xs font-bold text-gray-600 uppercase tracking-wide">Status</th>
                            <th className="text-left py-2.5 px-3 text-xs font-bold text-gray-600 uppercase tracking-wide">Date</th>
                            {user && user.role === 'superadmin' && (
                              <th className="text-right py-2.5 px-3 text-xs font-bold text-gray-600 uppercase tracking-wide">Cost</th>
                            )}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {paginatedRecords.map((record, idx) => (
                            <tr key={idx} className="hover:bg-blue-50/30 transition-colors">
                              <td className="py-2.5 px-3 text-gray-900 font-mono text-xs font-semibold">{record.phoneNumber}</td>
                              <td className="py-2.5 px-3 text-gray-900 text-xs font-medium">
                                {record.firstName} {record.lastName}
                              </td>
                              <td className="py-2.5 px-3 text-gray-600 text-xs">
                                {record.email ? (
                                  <a 
                                    href={`mailto:${record.email}`} 
                                    className="text-blue-600 hover:text-blue-800 font-medium hover:underline"
                                    title={record.email}
                                  >
                                    {record.email.length > 25 ? record.email.substring(0, 25) + '...' : record.email}
                                  </a>
                                ) : (
                                  <span className="text-gray-400">—</span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-gray-700 text-xs font-medium">
                                {record.carrier || 'Unknown'}
                              </td>
                              <td className="py-2.5 px-3">
                                <div className="inline-flex items-center gap-2 group relative">
                                  {getStatusBadge(record.status)}
                                  {record.statusReason && (
                                    <div className="relative">
                                      <div className="cursor-help text-gray-400 hover:text-blue-600 transition-colors">
                                        <Info size={14} strokeWidth={2.5} />
                                      </div>
                                      {/* Enhanced Tooltip */}
                                      <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block z-20 w-max max-w-xs">
                                        <div className="bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-xl">
                                          <div className="font-bold mb-1">Failure Reason:</div>
                                          <div className="text-gray-200 font-medium">{record.statusReason}</div>
                                          {/* Arrow */}
                                          <div className="absolute top-full left-4 -mt-1">
                                            <div className="border-4 border-transparent border-t-gray-900"></div>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </td>
                              <td className="py-2.5 px-3 text-gray-700 text-xs font-medium">
                                {record.date ? format(parseISO(record.date), 'MMM dd, h:mm a') : 'N/A'}
                              </td>
                              {user && user.role === 'superadmin' && (
                                <td className="py-2.5 px-3 text-right text-gray-900 font-bold text-xs">
                                  ${(record.cost + record.complianceFee + record.ttsFee).toFixed(4)}
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    
                    {/* Records Pagination */}
                    {totalRecordPages > 1 && (
                      <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-200/60 bg-gray-50/30 -mx-5 px-5 -mb-4 pb-4">
                        <div className="text-xs text-gray-600 font-medium">
                          {recordStartIndex + 1}–{Math.min(recordEndIndex, campaign.records.length)} of {campaign.records.length}
                        </div>
                        
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleRecordPageChange(campaign.campaignName, recordPage - 1)}
                            disabled={recordPage === 1}
                            className={`p-1.5 rounded-md border transition-colors ${
                              recordPage === 1
                                ? 'border-gray-200 text-gray-300 cursor-not-allowed bg-gray-50'
                                : 'border-gray-300 text-gray-600 hover:bg-white hover:border-gray-400'
                            }`}
                          >
                            <ChevronLeft size={14} strokeWidth={2.5} />
                          </button>
                          
                          {Array.from({ length: Math.min(5, totalRecordPages) }, (_, i) => {
                            let pageNum;
                            if (totalRecordPages <= 5) {
                              pageNum = i + 1;
                            } else if (recordPage <= 3) {
                              pageNum = i + 1;
                            } else if (recordPage >= totalRecordPages - 2) {
                              pageNum = totalRecordPages - 4 + i;
                            } else {
                              pageNum = recordPage - 2 + i;
                            }
                            
                            return (
                              <button
                                key={pageNum}
                                onClick={() => handleRecordPageChange(campaign.campaignName, pageNum)}
                                className={`min-w-[28px] px-2 py-1 rounded-md border text-xs font-bold transition-colors ${
                                  pageNum === recordPage
                                    ? 'border-blue-500 bg-blue-600 text-white shadow-sm'
                                    : 'border-gray-300 text-gray-600 hover:bg-white hover:border-gray-400'
                                }`}
                              >
                                {pageNum}
                              </button>
                            );
                          })}
                          
                          <button
                            onClick={() => handleRecordPageChange(campaign.campaignName, recordPage + 1)}
                            disabled={recordPage === totalRecordPages}
                            className={`p-1.5 rounded-md border transition-colors ${
                              recordPage === totalRecordPages
                                ? 'border-gray-200 text-gray-300 cursor-not-allowed bg-gray-50'
                                : 'border-gray-300 text-gray-600 hover:bg-white hover:border-gray-400'
                            }`}
                          >
                            <ChevronRight size={14} strokeWidth={2.5} />
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center py-8">
                    <p className="text-sm text-gray-500 font-medium">No call records available</p>
                  </div>
                )}
              </div>
            )}
          </div>
            );
          })}
        </div>
        
        {/* Campaign Pagination */}
        {totalPages > 1 && (
          <Pagination 
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={handlePageChange}
          />
        )}
      </div>
    </div>
  );
};

export default CampaignTable;
