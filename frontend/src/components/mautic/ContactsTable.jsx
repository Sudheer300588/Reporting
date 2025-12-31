/**
 * Contacts Table Component
 * 
 * Display recent contacts
 */

import React from 'react';
import { User, Award } from 'lucide-react';
import { formatDate, formatNumber } from '../../utils/mautic';

export default function ContactsTable({ contacts }) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <User className="text-blue-600" size={20} />
          <h2 className="text-lg font-semibold text-gray-900">
            Recent Contacts
          </h2>
        </div>
      </div>
      
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Contact
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Client
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Points
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Added
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {contacts.map((contact) => (
              <tr key={contact.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4">
                  <div className="flex items-start gap-2">
                    <User className="text-gray-400 flex-shrink-0 mt-0.5" size={16} />
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {contact.name}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {contact.email}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="text-sm text-gray-600">{contact.client}</span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Award className="text-yellow-500" size={14} />
                    <span className="text-sm font-medium text-gray-900">
                      {formatNumber(contact.points)}
                    </span>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="text-sm text-gray-600">
                    {formatDate(contact.dateAdded)}
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
