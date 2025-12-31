import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useAuth } from '../contexts/AuthContext.jsx'
import axios from 'axios'
import { 
  Users, FolderOpen, Activity, Mail, Phone, TrendingUp, TrendingDown,
  AlertTriangle, CheckCircle, Clock, RefreshCw, BarChart3, Zap,
  ArrowRight, Loader2, Server, CheckCircle2, XCircle, Pause
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell
} from 'recharts'
import { usePermissions } from '../utils/permissions'

const Dashboard = () => {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { hasFullAccess, hasPermission, canViewClients, canViewUsers, isTeamManager } = usePermissions(user)
  
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    totalEmployees: 0,
    totalClients: 0,
    totalManagers: 0,
    totalAdmins: 0
  })
  const [emailMetrics, setEmailMetrics] = useState(null)
  const [voicemailMetrics, setVoicemailMetrics] = useState(null)
  const [syncStatus, setSyncStatus] = useState({ mautic: null, dropCowboy: null })
  const [syncProgress, setSyncProgress] = useState(null)
  const [insights, setInsights] = useState([])
  const progressIntervalRef = useRef(null)

  const fetchSyncProgress = useCallback(async () => {
    try {
      const response = await axios.get('/api/mautic/sync/progress')
      if (response.data?.success) {
        setSyncProgress(response.data.data)
        if (!response.data.data.isActive && progressIntervalRef.current) {
          clearInterval(progressIntervalRef.current)
          progressIntervalRef.current = null
          fetchAllData()
        }
      }
    } catch (error) {
      console.error('Error fetching sync progress:', error)
    }
  }, [])

  useEffect(() => {
    fetchAllData()
    fetchSyncProgress()
  }, [])

  useEffect(() => {
    if (syncProgress?.isActive && !progressIntervalRef.current) {
      progressIntervalRef.current = setInterval(fetchSyncProgress, 3000)
    }
    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current)
        progressIntervalRef.current = null
      }
    }
  }, [syncProgress?.isActive, fetchSyncProgress])

  const fetchAllData = async () => {
    setLoading(true)
    try {
      await Promise.all([
        fetchDashboardStats(),
        fetchEmailMetrics(),
        fetchVoicemailMetrics(),
        fetchSyncStatus()
      ])
    } catch (error) {
      console.error('Error fetching dashboard data:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchDashboardStats = async () => {
    try {
      const requests = []
      
      if (canViewUsers()) {
        requests.push(axios.get('/api/users').catch(() => ({ data: { users: [] } })))
      } else {
        requests.push(Promise.resolve({ data: { users: [] } }))
      }
      
      requests.push(axios.get('/api/clients').catch(() => ({ data: [] })))
      requests.push(axios.get('/api/mautic/clients').catch(() => ({ data: { data: [] } })))

      const [usersRes, clientsRes, mauticRes] = await Promise.all(requests)

      const users = usersRes.data.users || []
      const clients = clientsRes.data || []
      const mauticClients = mauticRes.data?.data || []

      const isManager = (e) => {
        if (!e?.customRoleId) {
          return ['superadmin', 'admin', 'manager'].includes(e?.role)
        }
        return e?.customRole?.fullAccess || e?.customRole?.isTeamManager
      }

      const managerCount = users.filter(isManager).length
      const employeeCount = users.filter(e => !isManager(e)).length
      const adminCount = users.filter(e => e?.customRole?.fullAccess || (!e?.customRoleId && e?.role === 'admin')).length

      let clientCount = mauticClients.length
      if (!hasFullAccess()) {
        clientCount = mauticClients.filter(c => {
          const assignments = c.client?.assignments || []
          return assignments.some(a => (a.userId || a.user?.id) === user.id) || 
                 c.client?.createdById === user.id
        }).length
      }

      setStats({
        totalEmployees: hasFullAccess() ? employeeCount : 0,
        totalClients: clientCount,
        totalManagers: hasFullAccess() ? managerCount : 0,
        totalAdmins: hasFullAccess() ? adminCount : 0
      })
    } catch (error) {
      console.error('Error fetching stats:', error)
    }
  }

  const fetchEmailMetrics = async () => {
    try {
      const response = await axios.get('/api/mautic/dashboard')
      if (response.data?.success && response.data?.data) {
        const dashboardData = response.data.data
        const metrics = {
          ...dashboardData.emailStats,
          topEmails: dashboardData.topEmails || [],
          overview: dashboardData.overview
        }
        setEmailMetrics(metrics)
        generateInsights(metrics, 'email')
      }
    } catch (error) {
      console.error('Error fetching email metrics:', error)
    }
  }

  const fetchVoicemailMetrics = async () => {
    try {
      const response = await axios.get('/api/dropcowboy/metrics')
      if (response.data?.success) {
        setVoicemailMetrics(response.data.data)
        generateInsights(response.data.data, 'voicemail')
      }
    } catch (error) {
      console.error('Error fetching voicemail metrics:', error)
    }
  }

  const fetchSyncStatus = async () => {
    try {
      const [mauticRes, dropCowboyRes] = await Promise.all([
        axios.get('/api/mautic/sync/status').catch(() => ({ data: null })),
        axios.get('/api/dropcowboy/sync-status').catch(() => ({ data: null }))
      ])
      
      setSyncStatus({
        mautic: mauticRes.data,
        dropCowboy: dropCowboyRes.data
      })
    } catch (error) {
      console.error('Error fetching sync status:', error)
    }
  }

  const generateInsights = (data, type) => {
    const newInsights = []
    
    if (type === 'email' && data) {
      if (data.avgReadRate && parseFloat(data.avgReadRate) < 20) {
        newInsights.push({
          id: 'email-open-rate',
          type: 'warning',
          title: 'Low Email Open Rates',
          description: `Average open rate is ${data.avgReadRate}%. Consider optimizing subject lines.`,
          action: 'View Emails',
          link: '/services'
        })
      }
      if (data.totalBounced > 100) {
        newInsights.push({
          id: 'email-bounce',
          type: 'error',
          title: 'High Bounce Rate',
          description: `${data.totalBounced} emails bounced. Review email list quality.`,
          action: 'Review',
          link: '/services'
        })
      }
    }
    
    if (type === 'voicemail' && data?.overall) {
      const successRate = parseFloat(data.overall.averageSuccessRate || 0)
      if (successRate < 70 && data.overall.totalSent > 0) {
        newInsights.push({
          id: 'voicemail-delivery',
          type: 'warning',
          title: 'Voicemail Delivery Issues',
          description: `Only ${successRate}% delivery success. Check phone number quality.`,
          action: 'View Records',
          link: '/services'
        })
      }
    }

    if (newInsights.length > 0) {
      setInsights(prev => {
        const existingIds = new Set(newInsights.map(i => i.id))
        const filtered = prev.filter(i => !existingIds.has(i.id))
        return [...filtered, ...newInsights]
      })
    }
  }

  const getGreeting = () => {
    const hour = new Date().getHours()
    if (hour < 12) return 'Good morning'
    if (hour < 18) return 'Good afternoon'
    return 'Good evening'
  }

  const formatNumber = (num) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M'
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K'
    return num?.toString() || '0'
  }

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(amount || 0)
  }

  const formatTimeAgo = (dateString) => {
    if (!dateString) return 'Never'
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now - date
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)
    
    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    return `${diffDays}d ago`
  }

  const emailChartData = useMemo(() => {
    if (!emailMetrics?.topEmails) return []
    return emailMetrics.topEmails.slice(0, 7).map((email, idx) => ({
      name: email.name?.substring(0, 15) || `Email ${idx + 1}`,
      fullName: email.name || `Email ${idx + 1}`,
      sent: email.sentCount || 0,
      opened: email.readCount || 0,
      clicked: email.clickedCount || 0,
      bounced: email.bounced || 0,
      unsubscribed: email.unsubscribed || 0,
      openRate: parseFloat(email.readRate || 0),
      clickRate: parseFloat(email.clickRate || 0),
      unsubRate: parseFloat(email.unsubscribeRate || 0)
    }))
  }, [emailMetrics])

  const voicemailChartData = useMemo(() => {
    if (!voicemailMetrics?.campaigns) return []
    return voicemailMetrics.campaigns.slice(0, 6).map(campaign => ({
      name: campaign.campaignName?.substring(0, 12) || 'Campaign',
      sent: campaign.totalSent || 0,
      delivered: campaign.successfulDeliveries || 0,
      rate: parseFloat(campaign.successRate || 0)
    }))
  }, [voicemailMetrics])

  const pieChartData = useMemo(() => {
    if (!voicemailMetrics?.overall) return []
    const { successfulDeliveries, failedSends, otherStatus } = voicemailMetrics.overall
    return [
      { name: 'Delivered', value: successfulDeliveries || 0, color: '#10B981' },
      { name: 'Failed', value: failedSends || 0, color: '#EF4444' },
      { name: 'Other', value: otherStatus || 0, color: '#6B7280' }
    ].filter(d => d.value > 0)
  }, [voicemailMetrics])

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-12 w-12 animate-spin text-primary-600" />
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl pb-8 mx-auto px-4 sm:px-6 lg:px-8 animate-fade-in">
      <div className="card mb-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">
              {getGreeting()}, {user.name}!
            </h1>
            <p className="text-gray-600 text-sm">
              Welcome to your dashboard. Here's an overview of your business.
            </p>
          </div>
          <button
            onClick={fetchAllData}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          >
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>
      </div>

      {hasFullAccess() && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <SyncIndicator 
              label="Mautic" 
              status={syncStatus.mautic} 
              lastSync={syncStatus.mautic?.lastSyncAt || syncStatus.mautic?.lastSync}
              isActive={syncProgress?.isActive}
            />
            <SyncIndicator 
              label="DropCowboy" 
              status={syncStatus.dropCowboy} 
              lastSync={syncStatus.dropCowboy?.lastSyncAt || voicemailMetrics?.lastUpdated}
            />
          </div>
          {syncProgress?.isActive && syncProgress?.clientList?.length > 0 && (
            <SyncProgressPanel progress={syncProgress} />
          )}
        </>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          title={canViewUsers() ? 'Team Members' : 'My Team'}
          value={stats.totalEmployees}
          icon={Users}
          color="primary"
          onClick={() => navigate('/employees')}
        />
        <StatCard
          title={canViewClients() ? 'Total Clients' : 'My Clients'}
          value={stats.totalClients}
          icon={FolderOpen}
          color="secondary"
          onClick={() => navigate('/clients')}
        />
        {hasFullAccess() && (
          <>
            <StatCard
              title="Managers"
              value={stats.totalManagers}
              icon={Activity}
              color="purple"
              onClick={() => navigate('/employees')}
            />
            <StatCard
              title="Admins"
              value={stats.totalAdmins}
              icon={Zap}
              color="accent"
              onClick={() => navigate('/employees')}
            />
          </>
        )}
      </div>

      {insights.length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Insights & Alerts</h2>
          <div className="grid gap-3">
            {insights.map((insight, idx) => (
              <InsightCard key={idx} insight={insight} onClick={() => navigate(insight.link)} />
            ))}
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        {emailMetrics && (
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Mail className="text-blue-600" size={20} />
                Email Performance
              </h2>
              <button 
                onClick={() => {
                  localStorage.setItem('selectedService', 'mautic');
                  navigate('/services');
                }}
                className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1"
              >
                View All <ArrowRight size={14} />
              </button>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <MetricBox 
                label="Total Sent" 
                value={formatNumber(emailMetrics.totalSent)} 
                icon={Mail}
              />
              <MetricBox 
                label="Opened" 
                value={formatNumber(emailMetrics.totalRead)} 
                icon={CheckCircle}
                color="green"
              />
              <MetricBox 
                label="Clicked" 
                value={formatNumber(emailMetrics.totalClicked)} 
                icon={TrendingUp}
                color="blue"
              />
              <MetricBox 
                label="Bounced" 
                value={formatNumber(emailMetrics.totalBounced)} 
                icon={AlertTriangle}
                color="red"
              />
            </div>

            <div className="grid grid-cols-3 gap-2 mb-4">
              <RateBox label="Open Rate" value={emailMetrics.avgReadRate} />
              <RateBox label="Click Rate" value={emailMetrics.avgClickRate} />
              <RateBox label="Unsub Rate" value={emailMetrics.avgUnsubscribeRate} isNegative />
            </div>

            {emailChartData.length > 0 && (
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={emailChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip 
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload
                          return (
                            <div className="bg-white p-3 rounded-lg shadow-lg border text-xs">
                              <p className="font-semibold text-gray-900 mb-2">{data.fullName}</p>
                              <div className="space-y-1">
                                <p><span className="text-gray-500">Sent:</span> <span className="font-medium">{formatNumber(data.sent)}</span></p>
                                <p><span className="text-gray-500">Opened:</span> <span className="font-medium text-blue-600">{formatNumber(data.opened)}</span> ({data.openRate}%)</p>
                                <p><span className="text-gray-500">Clicked:</span> <span className="font-medium text-green-600">{formatNumber(data.clicked)}</span> ({data.clickRate}%)</p>
                                <p><span className="text-gray-500">Bounced:</span> <span className="font-medium text-red-600">{formatNumber(data.bounced)}</span></p>
                                <p><span className="text-gray-500">Unsubs:</span> <span className="font-medium text-orange-600">{formatNumber(data.unsubscribed)}</span> ({data.unsubRate}%)</p>
                              </div>
                            </div>
                          )
                        }
                        return null
                      }}
                    />
                    <Bar dataKey="sent" fill="#94A3B8" name="Sent" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="opened" fill="#3B82F6" name="Opened" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="clicked" fill="#10B981" name="Clicked" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}

        {voicemailMetrics?.overall && (
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Phone className="text-green-600" size={20} />
                Voicemail Performance
              </h2>
              <button 
                onClick={() => {
                  localStorage.setItem('selectedService', 'dropcowboy');
                  navigate('/services');
                }}
                className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1"
              >
                View All <ArrowRight size={14} />
              </button>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <MetricBox 
                label="Total Sent" 
                value={formatNumber(voicemailMetrics.overall.totalSent)} 
                icon={Phone}
              />
              <MetricBox 
                label="Delivered" 
                value={formatNumber(voicemailMetrics.overall.successfulDeliveries)} 
                icon={CheckCircle}
                color="green"
              />
              <MetricBox 
                label="Failed" 
                value={formatNumber(voicemailMetrics.overall.failedSends)} 
                icon={AlertTriangle}
                color="red"
              />
              <MetricBox 
                label="Total Cost" 
                value={formatCurrency(voicemailMetrics.overall.totalCost)} 
                icon={BarChart3}
                color="purple"
              />
            </div>

            <div className="flex items-center justify-between mb-4">
              <div className="flex-1">
                <div className="text-sm text-gray-600 mb-1">Success Rate</div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-gray-200 rounded-full h-3">
                    <div 
                      className="bg-green-500 h-3 rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(voicemailMetrics.overall.averageSuccessRate, 100)}%` }}
                    />
                  </div>
                  <span className="text-lg font-semibold text-green-600">
                    {voicemailMetrics.overall.averageSuccessRate}%
                  </span>
                </div>
              </div>
            </div>

            {pieChartData.length > 0 && (
              <div className="h-40 flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={60}
                      dataKey="value"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    >
                      {pieChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}
      </div>

      {hasFullAccess() && (
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <QuickActionButton 
              icon={RefreshCw} 
              label="Sync All Data" 
              onClick={() => {
                axios.post('/api/mautic/sync/all').catch(() => {})
                axios.post('/api/dropcowboy/fetch').catch(() => {})
                setTimeout(fetchSyncProgress, 500)
                fetchAllData()
              }}
            />
            <QuickActionButton 
              icon={FolderOpen} 
              label="Manage Clients" 
              onClick={() => navigate('/clients')}
            />
            <QuickActionButton 
              icon={Users} 
              label="Manage Users" 
              onClick={() => navigate('/employees')}
            />
            <QuickActionButton 
              icon={Activity} 
              label="View Activity" 
              onClick={() => navigate('/activities')}
            />
          </div>
        </div>
      )}
    </div>
  )
}

const StatCard = ({ title, value, icon: Icon, color, onClick }) => {
  const colorClasses = {
    primary: 'from-primary-500 to-primary-700',
    secondary: 'from-secondary-500 to-secondary-700',
    purple: 'from-purple-500 to-purple-700',
    accent: 'from-accent-500 to-accent-700'
  }

  return (
    <div
      onClick={onClick}
      className={`stats-card bg-gradient-to-br ${colorClasses[color]} cursor-pointer transform hover:scale-105 transition-transform`}
    >
      <div className="text-3xl font-bold mb-2">{value}</div>
      <div className="flex items-center text-sm opacity-90">
        <Icon size={16} className="mr-2" />
        {title}
      </div>
    </div>
  )
}

const MetricBox = ({ label, value, icon: Icon, color = 'gray' }) => {
  const colorClasses = {
    gray: 'text-gray-600',
    green: 'text-green-600',
    blue: 'text-blue-600',
    red: 'text-red-600',
    purple: 'text-purple-600'
  }

  return (
    <div className="bg-gray-50 rounded-lg p-3 text-center">
      <Icon size={18} className={`mx-auto mb-1 ${colorClasses[color]}`} />
      <div className="text-lg font-semibold text-gray-900">{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  )
}

const RateBox = ({ label, value, isNegative = false }) => {
  const numValue = parseFloat(value || 0)
  const colorClass = isNegative 
    ? (numValue > 5 ? 'text-red-600' : 'text-green-600')
    : (numValue > 20 ? 'text-green-600' : numValue > 10 ? 'text-yellow-600' : 'text-red-600')

  return (
    <div className="bg-gray-50 rounded-lg p-2 text-center">
      <div className={`text-lg font-semibold ${colorClass}`}>{numValue.toFixed(1)}%</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  )
}

const SyncIndicator = ({ label, status, lastSync, isActive }) => {
  const isRecent = lastSync && (new Date() - new Date(lastSync)) < 3600000

  return (
    <div className={`bg-white rounded-lg border ${isActive ? 'border-blue-300 bg-blue-50' : 'border-gray-200'} p-3 flex items-center gap-3`}>
      {isActive ? (
        <Loader2 size={14} className="animate-spin text-blue-600" />
      ) : (
        <div className={`w-2 h-2 rounded-full ${isRecent ? 'bg-green-500' : 'bg-yellow-500'}`} />
      )}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-900 flex items-center gap-2">
          {label}
          {isActive && <span className="text-xs text-blue-600 font-normal">Syncing...</span>}
        </div>
        <div className="text-xs text-gray-500 flex items-center gap-1">
          <Clock size={10} />
          {lastSync ? new Date(lastSync).toLocaleString() : 'Never synced'}
        </div>
      </div>
    </div>
  )
}

const SyncProgressPanel = ({ progress }) => {
  const { clientList, totalClients, completedClients, elapsedSeconds, currentBatch, totalBatches } = progress
  
  const formatDuration = (seconds) => {
    if (seconds < 60) return `${seconds}s`
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}m ${secs}s`
  }

  const getStatusIcon = (status) => {
    switch (status) {
      case 'syncing':
        return <Loader2 size={14} className="animate-spin text-blue-600" />
      case 'completed':
        return <CheckCircle2 size={14} className="text-green-600" />
      case 'failed':
        return <XCircle size={14} className="text-red-600" />
      case 'pending':
      default:
        return <Pause size={14} className="text-gray-400" />
    }
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'syncing': return 'bg-blue-50 border-blue-200'
      case 'completed': return 'bg-green-50 border-green-200'
      case 'failed': return 'bg-red-50 border-red-200'
      default: return 'bg-gray-50 border-gray-200'
    }
  }

  const progressPercent = totalClients > 0 ? Math.round((completedClients / totalClients) * 100) : 0

  return (
    <div className="card mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Server size={20} className="text-blue-600" />
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Sync Progress</h3>
            <p className="text-sm text-gray-500">
              Batch {currentBatch}/{totalBatches} - {completedClients}/{totalClients} clients - {formatDuration(elapsedSeconds)}
            </p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-blue-600">{progressPercent}%</div>
        </div>
      </div>

      <div className="w-full bg-gray-200 rounded-full h-2 mb-4">
        <div 
          className="bg-blue-600 h-2 rounded-full transition-all duration-500" 
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-64 overflow-y-auto">
        {clientList.map((client) => (
          <div 
            key={client.clientId} 
            className={`border rounded-lg p-3 ${getStatusColor(client.status)}`}
          >
            <div className="flex items-center gap-2 mb-1">
              {getStatusIcon(client.status)}
              <span className="font-medium text-gray-900 text-sm truncate">{client.clientName}</span>
            </div>
            <div className="text-xs text-gray-600 truncate">
              {client.message || (client.status === 'pending' ? 'Waiting...' : '')}
            </div>
            {client.status === 'completed' && (
              <div className="text-xs text-green-700 mt-1">
                {client.emails || 0} emails, {client.campaigns || 0} campaigns, {client.emailReports || 0} reports
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

const InsightCard = ({ insight, onClick }) => {
  const typeConfig = {
    warning: { bg: 'bg-yellow-50', border: 'border-yellow-200', icon: AlertTriangle, iconColor: 'text-yellow-600' },
    error: { bg: 'bg-red-50', border: 'border-red-200', icon: AlertTriangle, iconColor: 'text-red-600' },
    success: { bg: 'bg-green-50', border: 'border-green-200', icon: CheckCircle, iconColor: 'text-green-600' },
    info: { bg: 'bg-blue-50', border: 'border-blue-200', icon: Activity, iconColor: 'text-blue-600' }
  }

  const config = typeConfig[insight.type] || typeConfig.info
  const Icon = config.icon

  return (
    <div className={`${config.bg} ${config.border} border rounded-lg p-4 flex items-center justify-between`}>
      <div className="flex items-center gap-3">
        <Icon className={config.iconColor} size={20} />
        <div>
          <div className="font-medium text-gray-900">{insight.title}</div>
          <div className="text-sm text-gray-600">{insight.description}</div>
        </div>
      </div>
      {insight.action && (
        <button
          onClick={onClick}
          className="px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          {insight.action}
        </button>
      )}
    </div>
  )
}

const QuickActionButton = ({ icon: Icon, label, onClick }) => (
  <button
    onClick={onClick}
    className="flex flex-col items-center gap-2 p-4 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
  >
    <Icon size={24} className="text-primary-600" />
    <span className="text-sm font-medium text-gray-700">{label}</span>
  </button>
)

export default Dashboard
