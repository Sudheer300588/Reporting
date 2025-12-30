/**
 * Campaigns Section Component
 * 
 * Full list of email campaigns with pagination and stats
 */

import { useState, useEffect } from 'react';
import { Mail, TrendingUp, Eye, MousePointerClick, UserX, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useEmails } from '../../hooks/mautic';
import { formatNumber, formatPercentage, formatDate } from '../../utils/mautic';

export default function CampaignsSection({ clientId, refreshKey }) {
    const [page, setPage] = useState(1);
    const [limit] = useState(20);

    // If clientId is null or undefined, don't pass it (will fetch all clients' emails)
    const { emails, pagination, loading, error, refetch } = useEmails({
        clientId: clientId || undefined,
        page,
        limit
    });

    // Reset page when client changes
    useEffect(() => {
        setPage(1);
    }, [clientId]);

    // Refetch when a global refresh is requested (e.g., after sync)
    useEffect(() => {
        if (refreshKey) refetch();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [refreshKey]);

    if (loading) {
        return (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
                <div className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    <span className="ml-3 text-gray-600">Loading campaigns...</span>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
                <p className="text-red-600 text-center">{error}</p>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200">
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                            <Mail className="text-purple-600" size={20} />
                            Email Campaigns
                        </h3>
                        <p className="text-sm text-gray-600 mt-1">
                            {pagination?.total || 0} total campaigns
                        </p>
                    </div>
                </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Campaign Name
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Client
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Status
                            </th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Sent
                            </th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Open Rate
                            </th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Click Rate
                            </th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Unsubscribe
                            </th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {emails && emails.length > 0 ? (
                            emails.map((email) => (
                                <tr key={email.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4">
                                        <div>
                                            <div className="text-sm font-medium text-gray-900">
                                                {email.name}
                                            </div>
                                            {email.subject && (
                                                <div className="text-xs text-gray-500 mt-1">
                                                    {email.subject}
                                                </div>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm text-gray-900">{email.client?.name || 'N/A'}</div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        {email.isPublished ? (
                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                                Published
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                                                Draft
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right">
                                        <div className="text-sm text-gray-900">{formatNumber(email.sentCount)}</div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right">
                                        <div className="flex items-center justify-end gap-1">
                                            <Eye size={14} className="text-gray-400" />
                                            <span className="text-sm font-medium text-gray-900">
                                                {formatPercentage(email.readRate)}
                                            </span>
                                        </div>
                                        <div className="text-xs text-gray-500">
                                            {formatNumber(email.readCount)} opens
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right">
                                        <div className="flex items-center justify-end gap-1">
                                            <MousePointerClick size={14} className="text-gray-400" />
                                            <span className="text-sm font-medium text-gray-900">
                                                {formatPercentage(email.clickRate)}
                                            </span>
                                        </div>
                                        <div className="text-xs text-gray-500">
                                            {formatNumber(email.clickedCount)} clicks
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right">
                                        <div className="flex items-center justify-end gap-1">
                                            <UserX size={14} className="text-red-400" />
                                            <span className="text-sm font-medium text-gray-900">
                                                {formatPercentage(email.unsubscribeRate)}
                                            </span>
                                        </div>
                                        <div className="text-xs text-gray-500">
                                            {formatNumber(email.unsubscribed)} unsubs
                                        </div>
                                    </td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan="7" className="px-6 py-8 text-center text-gray-500">
                                    No campaigns found
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            {pagination && pagination.totalPages > 1 && (
                <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
                    <div className="text-sm text-gray-700">
                        Showing {((pagination.page - 1) * pagination.limit) + 1} to{' '}
                        {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
                        {pagination.total} campaigns
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setPage(page - 1)}
                            disabled={page === 1}
                            className="px-3 py-1 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <ChevronLeft size={16} />
                        </button>
                        <span className="text-sm text-gray-700">
                            Page {pagination.page} of {pagination.totalPages}
                        </span>
                        <button
                            onClick={() => setPage(page + 1)}
                            disabled={page === pagination.totalPages}
                            className="px-3 py-1 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <ChevronRight size={16} />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}