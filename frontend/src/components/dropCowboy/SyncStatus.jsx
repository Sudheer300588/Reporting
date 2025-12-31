import React from 'react';
import { RefreshCw, Download, Clock, CheckCircle, XCircle } from 'lucide-react';
import { format, parseISO } from 'date-fns';

const SyncStatus = ({ lastSync, onFetchNow, isFetching, syncLogs }) => {
  const getStatusIcon = (status) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="text-green-500" size={16} />;
      case 'failed':
        return <XCircle className="text-red-500" size={16} />;
      default:
        return <Clock className="text-gray-500" size={16} />;
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200/60 overflow-hidden">
      {/* Header Section */}
      <div className="bg-gradient-to-r from-blue-50/50 to-indigo-50/50 px-5 py-4 border-b border-gray-200/60">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-0.5">Data Sync & Frequency</h3>
            <p className="text-xs text-gray-500">Manage campaign data synchronization</p>
          </div>
          <button
            onClick={onFetchNow}
            disabled={isFetching}
            className={`flex items-center px-4 py-2.5 text-sm rounded-lg font-semibold transition-all ${
              isFetching
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700 hover:shadow-md shadow-sm'
            }`}
          >
            {isFetching ? (
              <>
                <RefreshCw className="animate-spin mr-2" size={16} />
                Syncing...
              </>
            ) : (
              <>
                <Download className="mr-2" size={16} />
                Fetch Now
              </>
            )}
          </button>
        </div>
      </div>

      {/* Content Section */}
      <div className="p-5">
        {/* Last Sync Info */}
        {lastSync && (
          <div className="mb-5 pb-5 border-b border-gray-200/60">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Last Update</p>
            <div className="flex items-center">
              <CheckCircle className="text-green-600 mr-2" size={15} strokeWidth={2.5} />
              <p className="text-sm font-semibold text-gray-900">
                {format(parseISO(lastSync), 'MMM dd, yyyy h:mm a')}
              </p>
            </div>
          </div>
        )}

        {/* Recent Activity Logs */}
        {syncLogs && syncLogs.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Recent Activity</h4>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {syncLogs.slice(0, 3).map((log, index) => (
                <div 
                  key={index} 
                  className="flex items-start p-3 bg-gray-50/50 rounded-lg border border-gray-200/60"
                >
                  <div className="mr-2.5 mt-0.5">{getStatusIcon(log.status)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-gray-900">
                        {log.status === 'success' ? 'Sync Successful' : 'Sync Failed'}
                      </span>
                      <span className="text-xs text-gray-500 font-medium">
                        {format(parseISO(log.timestamp), 'MMM dd, h:mm a')}
                      </span>
                    </div>
                    {log.status === 'success' && log.filesDownloaded > 0 && (
                      <p className="text-xs text-gray-600 font-medium">
                        {log.filesDownloaded} files · {log.totalRecords || 0} records
                      </p>
                    )}
                    {log.status === 'failed' && (
                      <p className="text-xs text-red-600 truncate font-medium">{log.error}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SyncStatus;
