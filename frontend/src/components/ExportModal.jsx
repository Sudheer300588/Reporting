import React, { useState, useMemo, useEffect } from 'react';
import { X, Loader, SlidersHorizontal, ChevronDown, ChevronUp } from 'lucide-react';
import { exportData } from '../utils/exportHelpers';
import { toast } from 'react-toastify';

const humanizeFieldName = (key) => {
  return key
    .replace(/\./g, ' ')
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/(^\w)|\s+(\w)/g, (m) => m.toUpperCase());
};

const collectFieldPaths = (rows, maxDepth = 3) => {
  const paths = new Set();

  const walk = (value, prefix = '', depth = 0) => {
    if (value === null || value === undefined || depth > maxDepth) return;

    if (Array.isArray(value)) {
      if (prefix) paths.add(prefix);
      return;
    }

    if (value instanceof Date) {
      if (prefix) paths.add(prefix);
      return;
    }

    if (typeof value === 'object') {
      const entries = Object.entries(value);
      if (entries.length === 0 && prefix) {
        paths.add(prefix);
      }
      entries.forEach(([k, v]) => {
        const next = prefix ? `${prefix}.${k}` : k;
        if (v !== null && typeof v === 'object' && !(v instanceof Date) && !Array.isArray(v)) {
          walk(v, next, depth + 1);
        } else {
          paths.add(next);
        }
      });
      return;
    }

    if (prefix) paths.add(prefix);
  };

  (rows || []).forEach((row) => walk(row));
  return Array.from(paths);
};

/**
 * Export Modal Component
 * Allows users to:
 * - Select export format (CSV, Excel, PDF, Word)
 * - Choose which columns to include
 * - Filter by date range (optional)
 * - Preview export stats
 */
export default function ExportModal({
  data,
  filename,
  title,
  columns,
  campaignType,
  onClose
}) {
  const today = new Date().toISOString().split('T')[0];
  const [selectedFormat, setSelectedFormat] = useState('excel');
  const [customFileName, setCustomFileName] = useState(`${filename}_${today}`);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [selectedColumns, setSelectedColumns] = useState({});
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [isExporting, setIsExporting] = useState(false);

  const effectiveColumns = useMemo(() => {
    const explicitColumns = columns || {};
    const detectedFields = collectFieldPaths(data || []);

    const merged = { ...explicitColumns };
    detectedFields.forEach((fieldKey) => {
      if (!merged[fieldKey]) {
        merged[fieldKey] = humanizeFieldName(fieldKey);
      }
    });

    return merged;
  }, [columns, data]);

  useEffect(() => {
    setSelectedColumns((prev) => {
      const next = {};
      Object.keys(effectiveColumns).forEach((key) => {
        next[key] = prev[key] ?? true;
      });
      return next;
    });
  }, [effectiveColumns]);

  const formats = [
    { value: 'csv', label: 'CSV', icon: '📊' },
    { value: 'excel', label: 'Excel', icon: '📈' },
    { value: 'pdf', label: 'PDF', icon: '📄' },
    { value: 'word', label: 'Word', icon: '📝' }
  ];

  const columnsList = Object.entries(effectiveColumns);

  // Filter data by date range if applicable
  const filteredData = useMemo(() => {
    if (!dateRange.start && !dateRange.end) {
      return data;
    }

    const startDate = dateRange.start ? new Date(dateRange.start) : null;
    const endDate = dateRange.end ? new Date(dateRange.end) : null;

    return data.filter(row => {
      // Look for date fields in the row
      for (let key in row) {
        const value = row[key];
        if (value instanceof Date) {
          if (startDate && value < startDate) return false;
          if (endDate && value > endDate) return false;
          return true;
        }
        // Also check for date strings
        if (typeof value === 'string' && !isNaN(Date.parse(value))) {
          const dateValue = new Date(value);
          if (startDate && dateValue < startDate) return false;
          if (endDate && dateValue > endDate) return false;
          return true;
        }
      }
      return true;
    });
  }, [data, dateRange]);

  // Get selected columns object for export
  const exportColumns = useMemo(() => {
    const selected = {};
    Object.entries(selectedColumns).forEach(([key, isSelected]) => {
      if (isSelected) {
        selected[key] = effectiveColumns[key];
      }
    });
    return selected;
  }, [selectedColumns, effectiveColumns]);

  const handleColumnToggle = (key) => {
    setSelectedColumns(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const handleSelectAll = () => {
    const allSelected = Object.keys(selectedColumns).every(key => selectedColumns[key]);
    const newSelection = {};
    Object.keys(selectedColumns).forEach(key => {
      newSelection[key] = !allSelected;
    });
    setSelectedColumns(newSelection);
  };

  const handleExport = async () => {
    try {
      setIsExporting(true);

      // Validate selection
      const selectedCount = Object.values(selectedColumns).filter(Boolean).length;
      if (selectedCount === 0) {
        toast.error('Please select at least one column');
        setIsExporting(false);
        return;
      }

      if (filteredData.length === 0) {
        toast.error('No data to export with current filters');
        setIsExporting(false);
        return;
      }

      // Use custom filename; fallback to default if empty
      const fullFilename = (customFileName || '').trim() || `${filename}_${today}`;

      // Export
      await exportData(filteredData, fullFilename, title, exportColumns, selectedFormat);

      toast.success(`✓ Exported ${filteredData.length} records as ${selectedFormat.toUpperCase()}`);
      onClose();
    } catch (error) {
      toast.error(`Failed to export: ${error.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  const applyPreset = (preset) => {
    const allSelected = {};
    Object.keys(effectiveColumns).forEach((key) => {
      allSelected[key] = true;
    });

    if (preset === 'quick') {
      setSelectedFormat('excel');
      setSelectedColumns(allSelected);
      setDateRange({ start: '', end: '' });
      setShowAdvanced(false);
      return;
    }

    if (preset === 'compact') {
      setSelectedFormat('csv');
      setSelectedColumns(allSelected);
      setDateRange({ start: '', end: '' });
      setShowAdvanced(false);
      return;
    }

    if (preset === 'report') {
      setSelectedFormat('pdf');
      setSelectedColumns(allSelected);
      setShowAdvanced(false);
    }
  };

  const selectedCount = columnsList.filter(([key]) => selectedColumns[key]).length;
  const fileName = `${((customFileName || '').trim() || `${filename}_${today}`)}.${selectedFormat === 'word' ? 'docx' : selectedFormat === 'excel' ? 'xlsx' : selectedFormat}`;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-lg max-w-lg w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 sticky top-0 bg-white">
          <h2 className="text-xl font-semibold text-gray-900">Export {title}</h2>
          <button
            onClick={onClose}
            disabled={isExporting}
            className="text-gray-400 hover:text-gray-600 disabled:text-gray-300"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Presets */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Quick Presets
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => applyPreset('quick')}
                className="p-2.5 rounded-lg border border-gray-200 bg-white text-gray-700 hover:border-blue-300 hover:bg-blue-50 text-sm font-medium transition-colors"
              >
                Quick Export
              </button>
              <button
                onClick={() => applyPreset('compact')}
                className="p-2.5 rounded-lg border border-gray-200 bg-white text-gray-700 hover:border-blue-300 hover:bg-blue-50 text-sm font-medium transition-colors"
              >
                Compact CSV
              </button>
              <button
                onClick={() => applyPreset('report')}
                className="p-2.5 rounded-lg border border-gray-200 bg-white text-gray-700 hover:border-blue-300 hover:bg-blue-50 text-sm font-medium transition-colors"
              >
                PDF Report
              </button>
            </div>
          </div>

          {/* Format Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Export Format
            </label>
            <div className="grid grid-cols-2 gap-2">
              {formats.map(format => (
                <button
                  key={format.value}
                  onClick={() => setSelectedFormat(format.value)}
                  className={`p-3 rounded-lg border-2 font-medium text-sm transition-all ${
                    selectedFormat === format.value
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <span className="text-lg">{format.icon}</span>
                  {format.label}
                </button>
              ))}
            </div>
          </div>

          {/* File Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              File Name
            </label>
            <input
              type="text"
              value={customFileName}
              onChange={(e) => setCustomFileName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter file name"
            />
          </div>

          {/* Advanced Options */}
          <div className="border border-gray-200 rounded-lg">
            <button
              type="button"
              onClick={() => setShowAdvanced((prev) => !prev)}
              className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
            >
              <span className="inline-flex items-center gap-2 text-sm font-medium text-gray-700">
                <SlidersHorizontal size={16} />
                Customize Columns & Filters
              </span>
              {showAdvanced ? <ChevronUp size={18} className="text-gray-500" /> : <ChevronDown size={18} className="text-gray-500" />}
            </button>

            {showAdvanced && (
              <div className="px-4 pb-4 space-y-4 border-t border-gray-200">
                {/* Column Selection */}
                <div className="pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <label className="block text-sm font-medium text-gray-700">
                      Columns ({selectedCount}/{columnsList.length})
                    </label>
                    <button
                      onClick={handleSelectAll}
                      className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                    >
                      {Object.values(selectedColumns).every(Boolean) ? 'Deselect All' : 'Select All'}
                    </button>
                  </div>
                  <div className="space-y-2 max-h-48 overflow-y-auto border border-gray-200 rounded-lg p-3 bg-gray-50">
                    {columnsList.map(([key, header]) => (
                      <label key={key} className="flex items-center gap-2 cursor-pointer hover:bg-white p-2 rounded transition-colors">
                        <input
                          type="checkbox"
                          checked={selectedColumns[key] || false}
                          onChange={() => handleColumnToggle(key)}
                          className="rounded border-gray-300"
                        />
                        <span className="text-sm text-gray-700">{header}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Date Range Filter (Optional) */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    Filter by Date Range (Optional)
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <input
                        type="date"
                        value={dateRange.start}
                        onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Start date"
                      />
                    </div>
                    <div>
                      <input
                        type="date"
                        value={dateRange.end}
                        onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="End date"
                      />
                    </div>
                  </div>
                </div>
            </div>
            )}
          </div>

          {/* Stats */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-sm text-blue-900">
              <span className="font-semibold">{filteredData.length}</span> records will be exported in{' '}
              <span className="font-semibold">{selectedFormat.toUpperCase()}</span> format
            </p>
            <p className="text-xs text-blue-700 mt-1">
              File: <code className="bg-white px-1.5 py-0.5 rounded text-gray-700">{fileName}</code>
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-6 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            disabled={isExporting}
            className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={isExporting || selectedCount === 0 || filteredData.length === 0}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium flex items-center justify-center gap-2"
          >
            {isExporting ? (
              <>
                <Loader size={18} className="animate-spin" />
                Exporting...
              </>
            ) : (
              'Download'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
