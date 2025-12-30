/**
 * Clients Table Component
 * 
 * Displays all Autovation Clients with management actions
 */

import { Edit, ToggleLeft, ToggleRight, CheckCircle, XCircle, EyeOff, EyeIcon } from 'lucide-react';
import { useClientManagement } from '../../hooks/mautic';
import { useState } from 'react';

const ClientsTable = ({ clients, onEdit, onRefresh }) => {
  const { deleteClient, isDeleting } = useClientManagement();
  const [visibleUsers, setVisibleUsers] = useState({});

  const toggleUser = (id) => {
    setVisibleUsers(prev => ({
      ...prev,
      [id]: !prev[id]     // toggle only this row
    }));
  };


  const handleToggleActive = async (client) => {
    const action = client.isActive ? 'deactivate' : 'activate';
    if (!window.confirm(`Are you sure you want to ${action} "${client.name}" (ID: ${client.id})?`)) {
      return;
    }

    const result = await deleteClient(client.id);

    if (result.success) {
      alert(`Client ${client.isActive ? 'deactivated' : 'activated'} successfully!`);
      onRefresh();
    } else {
      alert(`Failed to ${action} client: ` + result.error);
    }
  };

  if (!clients || clients.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
        <p className="text-gray-500">No clients configured yet. Add your first Mautic client to get started.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900">Autovation Clients</h3>
        <p className="text-sm text-gray-600 mt-1">Manage your Autovation instance connections</p>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Client Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Autovation
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Username
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {clients.map((client) => (
              <tr key={client.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">{client.name}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <a
                    href={client.mauticUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-3 py-1 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 transition"
                  >
                    Launch
                  </a>


                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-bold capitalize text-gray-900 first-letter:uppercase flex justify-start items-center gap-2">
                    {visibleUsers[client.id] ? (
                      <>
                        {client.username}
                        <button
                          className="text-sm text-blue-700 cursor-pointer flex items-center gap-2"
                          onClick={() => toggleUser(client.id)}
                        >
                          <EyeOff size={14} />
                        </button>
                      </>
                    ) : (
                      <>
                        {client.username.replace(/./g, '*')}
                        <button
                          className="text-sm text-blue-700 cursor-pointer flex items-center gap-2"
                          onClick={() => toggleUser(client.id)}
                        >
                          <EyeIcon size={14} />
                        </button>
                      </>
                    )}
                  </div>
                </td>


                <td className="px-6 py-4 whitespace-nowrap">
                  {client.isActive ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      <CheckCircle size={12} />
                      Active
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                      <XCircle size={12} />
                      Inactive
                    </span>
                  )}
                </td>


                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => onEdit(client)}
                      className="text-blue-600 hover:text-blue-900 p-1.5 hover:bg-blue-50 rounded transition-colors"
                      title="Edit client"
                    >
                      <Edit size={16} />
                    </button>
                    <button
                      onClick={() => handleToggleActive(client)}
                      disabled={isDeleting}
                      className={`p-1.5 rounded transition-colors disabled:opacity-50 ${client.isActive ? 'text-green-600 hover:text-green-900 hover:bg-green-50' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'}`}
                      title={client.isActive ? 'Deactivate client' : 'Activate client'}
                      aria-label={client.isActive ? 'Deactivate client' : 'Activate client'}
                    >
                      {client.isActive ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default ClientsTable;