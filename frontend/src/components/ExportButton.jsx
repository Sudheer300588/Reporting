import React, { useState } from 'react';
import { Download, ChevronDown } from 'lucide-react';
import ExportModal from './ExportModal';

/**
 * Reusable Export Button Component
 * 
 * Props:
 * - data: Array of objects to export
 * - filename: Base filename without extension
 * - title: Title for the export (used in PDFs, Word docs)
 * - columns: Object mapping data keys to display headers
 * - campaignType: 'sms', 'email', 'voicemail', 'vicidial' (optional, for analytics)
 * - variant: 'primary' | 'secondary' | 'compact' (default: 'primary')
 * - disabled: boolean
 */
export default function ExportButton({
  data,
  filename,
  title,
  columns,
  campaignType = 'campaign',
  variant = 'primary',
  disabled = false
}) {
  const [showModal, setShowModal] = useState(false);

  if (!data || data.length === 0) {
    return null;
  }

  const buttonClasses = {
    primary: 'flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium',
    secondary: 'flex items-center gap-2 px-4 py-2 max-md:p-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors max-md:text-sm font-medium',
    compact: 'flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-600 rounded hover:bg-gray-200 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors text-sm'
  };

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        disabled={disabled}
        className={buttonClasses[variant]}
        title={disabled ? 'No data to export' : 'Export campaign data'}
      >
        <Download size={variant === 'primary' ? 18 : 14} />
        {variant !== 'compact' && 'Export'}
        {variant === 'primary' && <ChevronDown size={18} />}
      </button>

      {showModal && (
        <ExportModal
          data={data}
          filename={filename}
          title={title}
          columns={columns}
          campaignType={campaignType}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}
