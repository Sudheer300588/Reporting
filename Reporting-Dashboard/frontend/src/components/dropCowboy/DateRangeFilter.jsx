import React, { useState } from 'react';
import { Calendar, X } from 'lucide-react';
import { format, subDays } from 'date-fns';

const DateRangeFilter = ({ onFilterChange, currentFilters }) => {
  const [showCustom, setShowCustom] = useState(false);
  const [startDate, setStartDate] = useState(currentFilters.startDate || '');
  const [endDate, setEndDate] = useState(currentFilters.endDate || '');
  const [activePreset, setActivePreset] = useState('all');

  const presets = [
    { label: 'All Time', value: 'all', days: null },
    { label: 'Last 24 Hours', value: '24h', days: 1 },
    { label: 'Last 7 Days', value: '7d', days: 7 },
    { label: 'Last 30 Days', value: '30d', days: 30 },
  ];

  const handlePresetClick = (preset) => {
    setActivePreset(preset.value);
    setShowCustom(false);
    
    if (preset.days === null) {
      // All time
      setStartDate('');
      setEndDate('');
      onFilterChange({ startDate: '', endDate: '' });
    } else {
      const end = new Date();
      const start = subDays(end, preset.days);
      const startStr = format(start, 'yyyy-MM-dd');
      const endStr = format(end, 'yyyy-MM-dd');
      
      setStartDate(startStr);
      setEndDate(endStr);
      onFilterChange({ startDate: startStr, endDate: endStr });
    }
  };

  const handleCustomDateChange = () => {
    if (startDate && endDate) {
      onFilterChange({ startDate, endDate });
    }
  };

  const clearFilters = () => {
    setStartDate('');
    setEndDate('');
    setActivePreset('all');
    setShowCustom(false);
    onFilterChange({ startDate: '', endDate: '' });
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200/60 p-4 sticky top-24">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Date Filter</h3>
        {(startDate || endDate) && (
          <button
            onClick={clearFilters}
            className="text-xs text-gray-500 hover:text-red-600 flex items-center font-medium transition-colors"
          >
            <X size={13} className="mr-1" strokeWidth={2.5} />
            Clear
          </button>
        )}
      </div>

      <div className="space-y-2">
        {presets.map((preset) => (
          <button
            key={preset.value}
            onClick={() => handlePresetClick(preset)}
            className={`w-full px-3 py-2 rounded-lg text-xs font-semibold transition-all text-left ${
              activePreset === preset.value
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200/60'
            }`}
          >
            {preset.label}
          </button>
        ))}
        <button
          onClick={() => {
            setShowCustom(!showCustom);
            setActivePreset('custom');
          }}
          className={`w-full px-3 py-2 rounded-lg text-xs font-semibold transition-all text-left ${
            showCustom
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200/60'
          }`}
        >
          <Calendar size={13} className="inline mr-1.5" strokeWidth={2.5} />
          Custom Range
        </button>
      </div>

      {showCustom && (
        <div className="space-y-3 pt-3 mt-3 border-t border-gray-200/60">
          <div>
            <label className="block text-xs text-gray-600 font-semibold mb-1.5">From</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-2.5 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 font-semibold mb-1.5">To</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-2.5 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <button
            onClick={handleCustomDateChange}
            disabled={!startDate || !endDate}
            className="w-full px-3 py-2 text-xs bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed transition-all shadow-sm disabled:shadow-none"
          >
            Apply Filter
          </button>
        </div>
      )}
    </div>
  );
};

export default DateRangeFilter;
