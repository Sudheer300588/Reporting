import { useEffect, useState } from 'react';
import api, { getWithCache } from '../api.js';
import { ChevronLeft, ChevronRight, Search, Filter, Download, RefreshCw, Users, Activity, TrendingUp, AlertCircle } from 'lucide-react';
import MetricCard from '../components/MetricCard';
import LoadingSkeleton from '../components/LoadingSkeleton';
import AgentCampaignsPanel from '../components/AgentCampaignsPanel';
import AgentStatsPanel from '../components/AgentStatsPanel';
import { toast } from 'react-toastify';

export default function VicidialDashboard(){
  const [agents, setAgents] = useState([]);
  const [filteredAgents, setFilteredAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [totals, setTotals] = useState({agents:0, campaigns:0, active:0});
  const [view, setView] = useState('list'); // 'list' | 'campaigns' | 'stats'
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [page, setPage] = useState(1);
  const [pageInput, setPageInput] = useState('1');
  const perPage = 8;
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'active' | 'inactive'
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [error, setError] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [liveAgentsCount, setLiveAgentsCount] = useState(0);

  const loadAgentsData = async (pageNum = 1) => {
    setLoading(true);
    setError(null);
    try{
      // fetch paginated agents from backend (db)
      const r = await api.get(`/agents/stats/paginated?page=${pageNum}&perPage=${perPage}`);
      const payload = r?.data?.data || {};
      const list = Array.isArray(payload.data) ? payload.data : [];

      // map agents for UI
      const mapped = list.map(a => ({
        user: a.user,
        name: a.fullName || a.full_name || a.user || '',
        campaigns: Array.isArray(a.campaigns) ? a.campaigns.length : 0,
        isActive: a.isActive || false
      }));

      setAgents(mapped);
      setFilteredAgents(mapped);
      
      // set totals from pagination and stats
      const pagination = payload.pagination || { total: mapped.length };
      const stats = payload.stats || {};
      
      // Use backend-provided stats for total active/inactive counts
      const activeCount = stats.totalActive !== undefined ? stats.totalActive : mapped.filter(a => a.isActive).length;
      const totalAgents = pagination.total;
      
      // fetch total campaigns sum separately (existing endpoint)
      let totalCampaigns = 0;
      try {
        const countsRes = await getWithCache(`/agents/campaigns/counts`, { ttl: 30_000 });
        const countsMap = countsRes?.data?.data || {};
        totalCampaigns = Object.values(countsMap).reduce((sum, v) => sum + Number(v || 0), 0);
      } catch (err) {
        console.warn('counts fetch failed', err);
      }

      // Set all totals at once to avoid race conditions
      setTotals({
        agents: totalAgents,
        active: activeCount,
        campaigns: totalCampaigns
      });
      
      setPage(payload.pagination?.page || pageNum);
      setPageInput(String(payload.pagination?.page || pageNum));

    }catch(err){
      console.error(err);
      setError('Failed to load agents data. Please try again.');
    }finally{ setLoading(false); }
  };

  // Fetch live agents count from dedicated endpoint
  const fetchLiveAgentsCount = async () => {
    try {
      const res = await api.get('/agents/stats/logged-in');
      const count = res?.data?.data?.count || 0;
      setLiveAgentsCount(count);
    } catch (err) {
      console.warn('Failed to fetch live agents count:', err);
      setLiveAgentsCount(0);
    }
  };

  const handleSyncCampaigns = async () => {
    setSyncing(true);
    setError(null);
    const toastId = toast.loading('Syncing campaigns for all agents...');
    try {
      const res = await api.get('/agents/campaigns/sync-all');
      // Reload data after sync
      await loadAgentsData(page);
      await fetchLiveAgentsCount(); // Also refresh live agents count
      toast.update(toastId, { 
        render: `✅ Synced campaigns for ${res.data.data.agents_processed} agents! Total: ${res.data.data.total_campaigns} campaigns`, 
        type: 'success', 
        isLoading: false, 
        autoClose: 5000 
      });
    } catch (err) {
      console.error('Sync failed:', err);
      setError('Failed to sync campaigns. Please try again.');
      toast.update(toastId, { 
        render: `❌ Failed to sync campaigns: ${err.message}`, 
        type: 'error', 
        isLoading: false, 
        autoClose: 5000 
      });
    } finally {
      setSyncing(false);
    }
  };

  // Search and filter functionality
  useEffect(() => {
    let result = [...agents];
    
    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(agent => 
        agent.user.toLowerCase().includes(query) ||
        agent.name.toLowerCase().includes(query)
      );
    }
    
    // Apply status filter
    if (statusFilter === 'active') {
      result = result.filter(agent => agent.isActive);
    } else if (statusFilter === 'inactive') {
      result = result.filter(agent => !agent.isActive);
    }
    
    // Apply sorting
    if (sortConfig.key) {
      result.sort((a, b) => {
        const aVal = a[sortConfig.key];
        const bVal = b[sortConfig.key];
        
        if (typeof aVal === 'string') {
          return sortConfig.direction === 'asc' 
            ? aVal.localeCompare(bVal)
            : bVal.localeCompare(aVal);
        }
        
        return sortConfig.direction === 'asc' 
          ? aVal - bVal
          : bVal - aVal;
      });
    }
    
    setFilteredAgents(result);
  }, [agents, searchQuery, statusFilter, sortConfig]);

  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const handleExport = async () => {
    try {
      setExporting(true);
      setError(null);
      
      // Fetch ALL agents from the database (not just current page)
      const allAgentsResponse = await api.get(`/agents/stats/paginated?page=1&perPage=1000`);
      const allAgentsPayload = allAgentsResponse?.data?.data || {};
      const allAgentsList = Array.isArray(allAgentsPayload.data) ? allAgentsPayload.data : [];
      
      // Map all agents
      const allAgents = allAgentsList.map(a => ({
        user: a.user,
        name: a.fullName || a.full_name || a.user || '',
        campaigns: Array.isArray(a.campaigns) ? a.campaigns.length : 0,
        isActive: a.isActive || false
      }));

      // Apply current filters to all agents (if any)
      let agentsToExport = [...allAgents];
      
      // Apply search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        agentsToExport = agentsToExport.filter(agent => 
          agent.user.toLowerCase().includes(query) ||
          agent.name.toLowerCase().includes(query)
        );
      }
      
      // Apply status filter
      if (statusFilter === 'active') {
        agentsToExport = agentsToExport.filter(agent => agent.isActive);
      } else if (statusFilter === 'inactive') {
        agentsToExport = agentsToExport.filter(agent => !agent.isActive);
      }
      
      // Apply sorting
      if (sortConfig.key) {
        agentsToExport.sort((a, b) => {
          const aVal = a[sortConfig.key];
          const bVal = b[sortConfig.key];
          
          if (typeof aVal === 'string') {
            return sortConfig.direction === 'asc' 
              ? aVal.localeCompare(bVal)
              : bVal.localeCompare(aVal);
          }
          
          return sortConfig.direction === 'asc' 
            ? aVal - bVal
            : bVal - aVal;
        });
      }
      
      // Get date range for stats (last 90 days)
      const end = new Date();
      const start = new Date(end.getTime() - (90*24*60*60*1000));
      
      const fmt = d => {
        const YYYY = d.getFullYear();
        const MM = String(d.getMonth() + 1).padStart(2, '0');
        const DD = String(d.getDate()).padStart(2, '0');
        const hh = String(d.getHours()).padStart(2, '0');
        const mm = String(d.getMinutes()).padStart(2, '0');
        const ss = String(d.getSeconds()).padStart(2, '0');
        return `${YYYY}-${MM}-${DD} ${hh}:${mm}:${ss}`;
      };

      // Fetch detailed stats for all agents to export
      const agentStatsPromises = agentsToExport.map(async (agent) => {
        try {
          const res = await api.get(`/agents/stats/single?agent_user=${encodeURIComponent(agent.user)}&start=${encodeURIComponent(fmt(start))}&end=${encodeURIComponent(fmt(end))}`);
          const stats = Array.isArray(res?.data?.data) ? res.data.data[0] : res?.data?.data;
          return { agent, stats: stats || {} };
        } catch (err) {
          console.error(`Failed to fetch stats for ${agent.user}:`, err);
          return { agent, stats: {} };
        }
      });

      const agentDataWithStats = await Promise.all(agentStatsPromises);

      // Format dates for CSV header
      const formatDate = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      };

      // Create comprehensive CSV with all statistics
      const csvContent = [
        ['ViciDial Agents Export Report'],
        [`Export Date: ${formatDate(new Date())}`],
        [`Statistics Period: ${formatDate(start)} to ${formatDate(end)}`],
        [`Total Agents Exported: ${agentsToExport.length}`],
        [], // Empty row for spacing
        [
          'S.No', 'Status', 'Agent ID', 'Agent Name', 'Campaigns',
          'Calls', 'Sessions', 'Pauses', 'Pauses/Session',
          'Login Time', 'Talk Time', 'Pause Time', 'Dispo Time',
          'Wait Time', 'Dead Time', 'Avg Session', 'Pause %'
        ],
        ...agentDataWithStats.map((item, idx) => {
          const { agent, stats } = item;
          return [
            idx + 1,
            agent.isActive ? 'Active' : 'Inactive',
            agent.user,
            agent.name || '—',
            agent.campaigns,
            stats.calls || '0',
            stats.sessions || '0',
            stats.pauses || '0',
            stats.pauses_per_session || '0',
            stats.login_time || '0:00',
            stats.total_talk_time || stats.talk_time || '0:00',
            stats.pause_time || '0:00',
            stats.dispo_time || '0:00',
            stats.wait_time || '0:00',
            stats.dead_time || '0:00',
            stats.avg_session || '0:00',
            stats.pause_pct || '0%'
          ];
        })
      ].map(row => row.join(',')).join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vicidial-agents-detailed-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      toast.success(`✅ Exported ${agentsToExport.length} agents with detailed statistics!`, {
        position: 'top-right',
        autoClose: 4000
      });
    } catch (err) {
      console.error('Export failed:', err);
      setError('Failed to export data: ' + err.message);
      toast.error(`❌ Failed to export data: ${err.message}`, {
        position: 'top-right',
        autoClose: 5000
      });
    } finally {
      setExporting(false);
    }
  };

  useEffect(()=>{
    loadAgentsData(1);
    fetchLiveAgentsCount();
    
    // Auto-refresh live agents count every 30 minutes
    const intervalId = setInterval(() => {
      fetchLiveAgentsCount();
    }, 1800000); // 30 minutes (30 * 60 * 1000)
    
    return () => clearInterval(intervalId);
  },[]);
  

  const handleRowClick = (agent) => {
    setSelectedAgent(agent);
    setView('campaigns');
  };

  const handlePageChange = (newPage) => {
    if (newPage >= 1) {
      loadAgentsData(newPage);
    }
  };

  const handlePageInputChange = (e) => setPageInput(e.target.value);

  const handlePageInputSubmit = (e) => {
    e.preventDefault();
    const pageNum = parseInt(pageInput);
    if (!isNaN(pageNum) && pageNum >= 1) {
      loadAgentsData(pageNum);
    } else {
      setPageInput(String(page));
    }
  };

  const handleShowStats = () => setView('stats');
  const handleBackToList = () => { setView('list'); setSelectedAgent(null); };

  return (
    <div className="space-y-8">
      {view === 'list' && (
        <>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2 flex items-center gap-3">
                <Users className="w-8 h-8 text-blue-600" />
                Vici Dial Agents
              </h1>
              <p className="text-gray-600">View and manage agent assignments and campaigns</p>
            </div>
            <div className="flex gap-3">
              <button 
                onClick={handleExport}
                disabled={exporting || loading}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center gap-2 shadow-sm"
              >
                <Download size={18} className={exporting ? 'animate-bounce' : ''} />
                {exporting ? 'Exporting...' : 'Export CSV'}
              </button>
              <button 
                onClick={handleSyncCampaigns} 
                disabled={syncing}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center gap-2 shadow-sm"
              >
                <RefreshCw size={18} className={syncing ? 'animate-spin' : ''} />
                {syncing ? 'Syncing...' : 'Sync All'}
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="text-red-800 font-semibold">Error</h3>
                <p className="text-red-700 text-sm">{error}</p>
              </div>
              <button 
                onClick={() => setError(null)}
                className="text-red-600 hover:text-red-800"
              >
                ×
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard title="Total Agents" value={totals.agents} color="blue" icon={<Users />} />
            <MetricCard title="Total Campaigns" value={totals.campaigns} color="green" icon={<Activity />} />
            <MetricCard 
              title="Live Agents" 
              value={liveAgentsCount} 
              color="dark" 
              icon={<TrendingUp />}
              trend="🔄 Auto-refreshing every 30 min"
            />
            <MetricCard title="Inactive" value={totals.agents - liveAgentsCount} color="gray" />
          </div>

          {/* Search and Filter Bar */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="text"
                  placeholder="Search by Agent ID or Name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex gap-2 items-center">
                <Filter className="text-gray-400 w-5 h-5" />
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="all">All Status</option>
                  <option value="active">Active Only</option>
                  <option value="inactive">Inactive Only</option>
                </select>
              </div>
              {(searchQuery || statusFilter !== 'all') && (
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setStatusFilter('all');
                    setSortConfig({ key: null, direction: 'asc' });
                  }}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                >
                  Clear Filters
                </button>
              )}
            </div>
            {filteredAgents.length !== agents.length && (
              <div className="mt-3 text-sm text-gray-600">
                Showing {filteredAgents.length} of {agents.length} agents
              </div>
            )}
          </div>
        </>
      )}

      {view === 'list' && (
        <div>
          {loading ? (
            <LoadingSkeleton rows={8} columns={5} />
          ) : filteredAgents.length === 0 ? (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
              <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-700 mb-2">No agents found</h3>
              <p className="text-gray-500 mb-4">
                {searchQuery || statusFilter !== 'all' 
                  ? 'Try adjusting your search or filter criteria'
                  : 'No agents available at the moment'}
              </p>
              {(searchQuery || statusFilter !== 'all') && (
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setStatusFilter('all');
                  }}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Clear Filters
                </button>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead className="bg-gradient-to-r from-gray-50 to-gray-100 border-b-2 border-gray-200">
                    <tr className="text-sm font-semibold text-gray-700">
                      <th className="py-4 px-6 text-left">S.No</th>
                      <th 
                        className="py-4 px-6 text-left cursor-pointer hover:bg-gray-200 transition-colors"
                        onClick={() => handleSort('isActive')}
                      >
                        <div className="flex items-center gap-2">
                          Status
                          {sortConfig.key === 'isActive' && (
                            <span>{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                          )}
                        </div>
                      </th>
                      <th 
                        className="py-4 px-6 text-left cursor-pointer hover:bg-gray-200 transition-colors"
                        onClick={() => handleSort('user')}
                      >
                        <div className="flex items-center gap-2">
                          Agent ID
                          {sortConfig.key === 'user' && (
                            <span>{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                          )}
                        </div>
                      </th>
                      <th 
                        className="py-4 px-6 text-left cursor-pointer hover:bg-gray-200 transition-colors"
                        onClick={() => handleSort('name')}
                      >
                        <div className="flex items-center gap-2">
                          Agent Name
                          {sortConfig.key === 'name' && (
                            <span>{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                          )}
                        </div>
                      </th>
                      <th 
                        className="py-4 px-6 text-left cursor-pointer hover:bg-gray-200 transition-colors"
                        onClick={() => handleSort('campaigns')}
                      >
                        <div className="flex items-center gap-2">
                          Campaigns
                          {sortConfig.key === 'campaigns' && (
                            <span>{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                          )}
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {filteredAgents.map((a, idx) => (
                      <tr 
                        key={a.user || idx} 
                        className="cursor-pointer hover:bg-blue-50 transition-all duration-200 group" 
                        onClick={() => handleRowClick(a)}
                      >
                        <td className="py-4 px-6 text-gray-500 font-medium">{idx + 1}</td>
                        <td className="py-4 px-6">
                          <div className="flex items-center gap-2">
                            <div className={`w-3 h-3 rounded-full ${a.isActive ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`} title={a.isActive ? 'Active' : 'Inactive'}></div>
                            <span className={`text-sm font-semibold px-2 py-1 rounded ${a.isActive ? 'text-green-700 bg-green-50' : 'text-gray-500 bg-gray-50'}`}>
                              {a.isActive ? 'Active' : 'Inactive'}
                            </span>
                          </div>
                        </td>
                        <td className="py-4 px-6">
                          <span className="font-mono text-sm text-blue-600 font-bold bg-blue-50 px-3 py-1 rounded-md group-hover:bg-blue-100 transition-colors">
                            {a.user}
                          </span>
                        </td>
                        <td className="py-4 px-6 text-gray-900 font-medium">{a.name || '—'}</td>
                        <td className="py-4 px-6">
                          <span className="inline-flex items-center justify-center min-w-[60px] px-3 py-1 rounded-full bg-gradient-to-r from-green-100 to-emerald-100 text-green-700 font-bold text-sm shadow-sm">
                            {typeof a.campaigns === 'number' ? a.campaigns : '—'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Agents pagination controls */}
              <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-gray-50 to-gray-100 border-t-2 border-gray-200 flex-wrap gap-4">
                <div className="text-sm text-gray-600 font-medium">
                  Total agents: <span className="font-bold text-gray-900">{totals.agents}</span>
                  {filteredAgents.length !== agents.length && (
                    <span className="ml-2 text-blue-600">
                      (Filtered: {filteredAgents.length})
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => handlePageChange(page - 1)}
                    disabled={page === 1}
                    className="flex items-center gap-2 px-4 py-2 bg-white text-gray-700 border border-gray-300 rounded-full shadow-sm hover:bg-blue-500 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 font-medium text-sm"
                  >
                    <ChevronLeft size={16} /> Previous
                  </button>

                  <form onSubmit={handlePageInputSubmit} className="flex items-center gap-2">
                    <span className="text-sm text-gray-600 font-medium">Page</span>
                    <input
                      type="number"
                      min="1"
                      max={Math.ceil(totals.agents / perPage) || 1}
                      value={pageInput}
                      onChange={handlePageInputChange}
                      className="w-16 px-3 py-1 border border-gray-300 rounded-md text-center focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium text-sm shadow-sm"
                    />
                    <span className="text-sm text-gray-600 font-medium">of {Math.ceil(totals.agents / perPage) || 1}</span>
                  </form>

                  <button
                    onClick={() => handlePageChange(page + 1)}
                    disabled={page >= Math.ceil(totals.agents / perPage)}
                    className="flex items-center gap-2 px-4 py-2 bg-white text-gray-700 border border-gray-300 rounded-full shadow-sm hover:bg-blue-500 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 font-medium text-sm"
                  >
                    Next <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {view === 'campaigns' && selectedAgent && (
        <AgentCampaignsPanel agentUser={selectedAgent.user} agentName={selectedAgent.name} onBack={handleBackToList} onShowStats={handleShowStats} />
      )}

      {view === 'stats' && selectedAgent && (
        <AgentStatsPanel agentUser={selectedAgent.user} agentName={selectedAgent.name} onBack={() => setView('campaigns')} />
      )}
    </div>
  )
}
