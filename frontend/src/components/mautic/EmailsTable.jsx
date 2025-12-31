/**
 * Emails Table Component
 * 
 * Display top performing emails
 */

import React from 'react';
import { Mail, TrendingUp } from 'lucide-react';
import { formatNumber, formatPercentage, getRateColor } from '../../utils/mautic';

export default function EmailsTable({ emails }) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <TrendingUp className="text-green-600" size={20} />
          <h2 className="text-lg font-semibold text-gray-900">
            Top Performing Emails
          </h2>
        </div>
      </div>
      
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Email
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Client
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
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {emails.map((email) => (
              <tr key={email.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4">
                  <div className="flex items-start gap-2">
                    <Mail className="text-gray-400 flex-shrink-0 mt-0.5" size={16} />
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {email.name}
                      </div>
                      {email.subject && (
                        <div className="text-xs text-gray-500 mt-0.5">
                          {email.subject}
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="text-sm text-gray-600">{email.client}</span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right">
                  <span className="text-sm font-medium text-gray-900">
                    {formatNumber(email.sentCount)}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right">
                  <span className={`text-sm font-semibold ${getRateColor(email.readRate, 'read')}`}>
                    {formatPercentage(email.readRate)}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right">
                  <span className={`text-sm font-semibold ${getRateColor(email.clickRate, 'click')}`}>
                    {formatPercentage(email.clickRate)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
