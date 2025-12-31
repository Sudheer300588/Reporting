/**
 * Client Selector Component
 */

import React from 'react';

export default function ClientSelector({ clients, selectedClientId, onChange }) {
    return (
        <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">Client:</label>
            <select
                value={selectedClientId || ''}
                onChange={(e) => onChange(e.target.value ? parseInt(e.target.value) : null)}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
                <option value="">All Clients</option>
                {clients.map(client => (
                    <option key={client.id} value={client.id}>
                        {client.name}
                    </option>
                ))}
            </select>
        </div>
    );
}