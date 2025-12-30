import { useEffect, useState } from 'react';
import LoadingSkeleton from './LoadingSkeleton';
import MetricCard from './MetricCard';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import BackButton from './BackButton';
import api from '../api.js';

export default function AgentStatsPanel({ agentUser, agentName, onBack }){
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tempStartDate, setTempStartDate] = useState('');
  const [tempEndDate, setTempEndDate] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const formatTimeValue = (value) => {
    if (!value) return '0:00';
    // If already formatted as MM:SS or HH:MM:SS, return as-is
    if (typeof value === 'string' && value.includes(':')) return value;
    // Otherwise convert seconds to MM:SS
    const totalSec = parseInt(value) || 0;
    const minutes = Math.floor(totalSec / 60);
    const seconds = totalSec % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  };

  useEffect(()=>{
    let mounted = true;
    const load = async ()=>{
      setLoading(true);
      try{
        let end, start;
        const fmt = d => {
          const YYYY = d.getFullYear();
          const MM = String(d.getMonth() + 1).padStart(2, '0');
          const DD = String(d.getDate()).padStart(2, '0');
          const hh = String(d.getHours()).padStart(2, '0');
          const mm = String(d.getMinutes()).padStart(2, '0');
          const ss = String(d.getSeconds()).padStart(2, '0');
          return `${YYYY}-${MM}-${DD} ${hh}:${mm}:${ss}`;
        };

        if (startDate && endDate) {
          // Date input returns YYYY-MM-DD format
          // Create date objects properly to avoid timezone issues
          const [sYear, sMonth, sDay] = startDate.split('-').map(Number);
          const [eYear, eMonth, eDay] = endDate.split('-').map(Number);
          start = new Date(sYear, sMonth - 1, sDay, 0, 0, 0);
          end = new Date(eYear, eMonth - 1, eDay, 23, 59, 59);
        } else {
          end = new Date();
          start = new Date(end.getTime() - (90*24*60*60*1000));
        }

        // Don't cache stats - always fetch fresh data
        const res = await api.get(`/agents/stats/single?agent_user=${encodeURIComponent(agentUser)}&start=${encodeURIComponent(fmt(start))}&end=${encodeURIComponent(fmt(end))}`);
        if (!mounted) return;
        const payload = res?.data?.data;
        console.log("payload:", payload);
        
        if (Array.isArray(payload)) {
          setData(payload[0] || null);
        } else {
          setData(payload || null);
        }
      }catch(err){ console.error(err); }
      finally{ if(mounted) setLoading(false); }
    }
    load();
    return ()=>{ mounted = false };
  },[agentUser, startDate, endDate]);

  const handleDateApply = () => {
    setStartDate(tempStartDate);
    setEndDate(tempEndDate);
  };

  const handleDateClear = () => {
    setTempStartDate('');
    setTempEndDate('');
    setStartDate('');
    setEndDate('');
  };

  const parse = t => {
    if(!t) return 0;
    const parts = String(t).split(':').map(n=>Number(n));
    if(parts.length === 3) return parts[0]*3600 + parts[1]*60 + parts[2];
    if(parts.length === 2) return parts[0]*60 + parts[1];
    return Number(parts[0]) || 0;
  }

  const chartData = data ? [
    // { name: 'Calls', value: Number(data.calls || 0), fill: '#3b82f6' },
    { name: 'Login Time (s)', value: parse(data.login_time), fill: '#10b981' },
    { name: 'Talk Time (s)', value: parse(data.total_talk_time || data.talk_time), fill: '#ec4899' },
    { name: 'Pause Time (s)', value: parse(data.pause_time), fill: '#8b5cf6' },
    { name: 'Dispo Time (s)', value: parse(data.dispo_time), fill: '#f59e0b' },
  ] : [];

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-3 mb-2">
          <BackButton onClick={onBack} />
          <h1 className="text-3xl font-bold text-gray-900">Stats for {agentUser} • {agentName || (data && data.full_name) || '—'}</h1>
        </div>
        <p className="text-gray-600">Performance metrics and analytics</p>
      </div>

      {/* Date Range Filter for Stats */}
      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
        <div className="flex items-end gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">From Date</label>
            <input 
              type="date" 
              value={tempStartDate} 
              onChange={(e) => setTempStartDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="dd-mm-yyyy"
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">To Date</label>
            <input 
              type="date" 
              value={tempEndDate} 
              onChange={(e) => setTempEndDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="dd-mm-yyyy"
            />
          </div>
          <button 
            onClick={handleDateApply}
            className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium transition-colors"
          >
            Apply
          </button>
          <button 
            onClick={handleDateClear}
            className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 font-medium transition-colors"
          >
            Clear
          </button>
        </div>
      </div>

      {loading ? (
        <LoadingSkeleton rows={4} />
      ) : (!data ? (
        <div className="py-12 text-center text-gray-500 bg-gray-50 rounded-lg border border-gray-200">No stats found</div>
      ) : (
        <>
          {/* Count Metrics Section */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Activity Counts</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <MetricCard title="Calls" value={data.calls || '0'} color="blue" />
              <MetricCard title="Sessions" value={data.sessions || '0'} color="green" />
              <MetricCard title="Pauses" value={data.pauses || '0'} color="dark" />
              <MetricCard title="Pauses/Session" value={data.pauses_per_session || '0'} color="blue" />
            </div>
          </div>

          {/* Time Metrics Section */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Time Breakdown</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <MetricCard title="Login Time" value={formatTimeValue(data.login_time)} color="green" />
              <MetricCard title="Talk Time" value={formatTimeValue(data.total_talk_time || data.talk_time)} color="blue" />
              <MetricCard title="Pause Time" value={formatTimeValue(data.pause_time)} color="dark" />
              <MetricCard title="Dispo Time" value={formatTimeValue(data.dispo_time)} color="green" />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
              <MetricCard title="Wait Time" value={formatTimeValue(data.wait_time)} color="blue" />
              <MetricCard title="Dead Time" value={formatTimeValue(data.dead_time)} color="dark" />
              <MetricCard title="Avg Session" value={formatTimeValue(data.avg_session)} color="green" />
              <MetricCard title="Pause %" value={data.pause_pct || '0%'} color="blue" />
            </div>
          </div>

          <div className="bg-white rounded-lg p-6 border border-gray-200 shadow-sm">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Performance Overview</h3>
            <div style={{height:320}}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{top:10,right:20,left:10,bottom:20}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="name" tick={{fontSize:12, fill: '#6b7280'}} />
                  <YAxis tick={{fontSize:12, fill: '#6b7280'}} />
                  <Tooltip 
                    contentStyle={{backgroundColor: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                    labelStyle={{color: '#111827', fontWeight: 600}}
                    itemStyle={{color: '#6b7280'}}
                  />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      ))}
    </div>
  )
}
