import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useTimezone } from '../contexts/TimezoneContext.jsx'
import axios from 'axios'
import { toast } from 'react-toastify'
import {
  Users, FolderOpen, Activity, Mail, Phone, TrendingUp, TrendingDown,
  AlertTriangle, CheckCircle, Clock, RefreshCw, BarChart3, Zap,
  ArrowRight, Loader2, XCircle, MessageSquare
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell
} from 'recharts'
import { usePermissions } from '../utils/permissions'

const Dashboard = () => {
  const { user } = useAuth()
  const { formatDateTime, getCurrentHour } = useTimezone()
  const navigate = useNavigate()
  const { hasFullAccess, hasPermission, canViewClients, canViewUsers, isTeamManager } = usePermissions(user)

  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    totalEmployees: 0,
    totalClients: 0,
    activeClients: 0,
    inactiveClients: 0,
    totalManagers: 0,
    totalAdmins: 0
  })
  const [emailMetrics, setEmailMetrics] = useState(null)
  const [voicemailMetrics, setVoicemailMetrics] = useState(null)
  const [smsMetrics, setSmsMetrics] = useState(null)
  const [syncStatus, setSyncStatus] = useState({ mautic: null, dropCowboy: null, sms: null })
  const [insights, setInsights] = useState([])
  const [isSyncing, setIsSyncing] = useState(false)

  useEffect(() => {
    fetchAllData()
  }, [])

  const fetchAllData = async () => {
    setLoading(true)
    try {
      // 🚀 OPTIMIZED: Single consolidated API call instead of 9 separate calls
      const response = await axios.get('/api/dashboard/overview')

      if (response.data?.success && response.data?.data) {
        const { stats, emailMetrics, voicemailMetrics, smsMetrics, syncStatus: syncData } = response.data.data

        // Update all state at once
        setStats(stats || {
          totalEmployees: 0,
          totalClients: 0,
          activeClients: 0,
          inactiveClients: 0,
          totalManagers: 0,
          totalAdmins: 0
        })

        setEmailMetrics(emailMetrics || null)
        setVoicemailMetrics(voicemailMetrics || null)
        setSmsMetrics(smsMetrics || null)

        setSyncStatus({
          mautic: { data: syncData?.mautic || null },
          dropCowboy: { data: syncData?.dropCowboy || null },
          sms: { data: syncData?.sms || null }
        })

        // Generate insights based on metrics
        generateInsights(emailMetrics, voicemailMetrics)
      }
    } catch (error) {
    } finally {
      setLoading(false)
    }
  }

  const generateInsights = (email, voicemail) => {
    const newInsights = []

    if (email && email.totalSent > 0) {
      if (email.avgReadRate < 25) {
        newInsights.push({
          type: 'warning',
          title: 'Low Email Open Rates',
          description: `Average open rate is ${email.avgReadRate?.toFixed(2)}%. Consider optimizing subject lines.`,
          action: 'View Emails',
          link: '/services',
          service: 'mautic'
        })
      }
      if (email.bounceRate > 5) {
        newInsights.push({
          type: 'alert',
          title: 'High Bounce Rate',
          description: `Bounce rate is ${email.bounceRate}%. Clean your email list to improve deliverability.`,
          action: 'View Details',
          link: '/services',
          service: 'mautic'
        })
      }
    }

    if (voicemail?.overall && voicemail.overall.totalSent > 0) {
      if (voicemail.overall.averageSuccessRate < 70) {
        newInsights.push({
          type: 'warning',
          title: 'Voicemail Delivery Issues',
          description: `Only ${voicemail.overall.averageSuccessRate}% delivery success. Check phone number quality.`,
          action: 'View Records',
          link: '/services',
          service: 'dropcowboy'
        })
      }
    }

    setInsights(newInsights)
  }

  const getGreeting = () => {
    const hour = getCurrentHour()
    if (hour < 12) return 'Good morning'
    if (hour < 18) return 'Good afternoon'
    return 'Good evening'
  }

  const formatNumber = (num) => {
    if (num >= 1000000) return (Math.floor(num / 100000) / 10).toFixed(1) + 'M'
    if (num >= 1000) return (Math.floor(num / 100) / 10).toFixed(1) + 'K'
    return num?.toString() || '0'
  }

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(amount || 0)
  }

  const handleNavigate = (insight) => {
    localStorage.setItem('selectedService', insight.service);
    navigate(insight.link);
  };

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

    // Track used names to ensure uniqueness
    const usedNames = new Set()

    return emailMetrics.topEmails.slice(0, 6).map((email, idx) => {
      const fullName = email.name || `Email ${idx + 1}`
      let displayName = fullName.length > 15 ? fullName.substring(0, 12) + '...' : fullName

      // Ensure unique display names by appending number if needed
      let uniqueName = displayName
      let counter = 1
      while (usedNames.has(uniqueName)) {
        uniqueName = `${displayName} (${counter})`
        counter++
      }
      usedNames.add(uniqueName)

      return {
        id: `email-${idx}-${email.id || email.emailId || idx}`, // Unique key for chart
        name: uniqueName,
        fullName: fullName,
        clientName: email.clientName || '',
        sent: email.sent || email.sentCount || 0,
        opened: email.read || email.readCount || 0,
        clicked: email.clicked || email.clickedCount || 0,
        uniqueClicks: email.uniqueHits || email.uniqueClicks || 0,
        bounced: email.bounced || 0,
        unsubscribed: email.unsubscribed || 0,
        openRate: parseFloat(email.openRate || email.readRate || 0),
        clickRate: parseFloat(email.clickRate || 0),
        unsubRate: parseFloat(email.unsubscribeRate || 0)
      }
    })
  }, [emailMetrics])

  const voicemailChartData = useMemo(() => {
    if (!voicemailMetrics?.campaigns || !Array.isArray(voicemailMetrics.campaigns)) return []
    return voicemailMetrics.campaigns.slice(0, 6).map(campaign => ({
      name: campaign.campaignName?.substring(0, 12) || 'Campaign',
      sent: campaign.totalSent || 0,
      delivered: campaign.successfulDeliveries || 0,
      rate: parseFloat(campaign.successRate || 0)
    }))
  }, [voicemailMetrics])

  const pieChartData = useMemo(() => {
    if (!voicemailMetrics?.overall) return []
    const { successfulDeliveries = 0, failedSends = 0, otherStatus = 0 } = voicemailMetrics.overall
    return [
      { name: 'Delivered', value: successfulDeliveries, color: '#10B981' },
      { name: 'Failed', value: failedSends, color: '#EF4444' },
      { name: 'Other', value: otherStatus, color: '#6B7280' }
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
            <SyncIndicator
              label="Autovation"
              status={syncStatus.mautic?.data}
              lastSync={syncStatus.mautic?.data?.lastUpdated || syncStatus.mautic?.data?.lastSync || syncStatus.mautic?.data?.lastSyncAt}
            />
            <SyncIndicator
              label="Ringless Voicemail"
              status={syncStatus.dropCowboy?.data}
              lastSync={syncStatus.dropCowboy?.data?.lastSyncAt || syncStatus.dropCowboy?.data?.lastUpdated || voicemailMetrics?.lastUpdated}
            />
            <SyncIndicator
              label="SMS Clients"
              status={syncStatus.sms?.data}
              lastSync={syncStatus.sms?.data?.lastSyncAt || syncStatus.sms?.data?.lastUpdated || syncStatus.sms?.data?.lastSync}
            />
          </div>
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
              <InsightCard key={idx} insight={insight} onClick={() => handleNavigate(insight)} />
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

            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
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
                label="Clicks"
                value={formatNumber(emailMetrics.totalClicked)}
                icon={TrendingUp}
                color="blue"
              />
              <MetricBox
                label="Unique Clicks"
                value={formatNumber(emailMetrics.totalUniqueClicks)}
                icon={Users}
                color="purple"
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
              <div className="h-48 min-h-[192px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={emailChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 10 }}
                      angle={-15}
                      textAnchor="end"
                      height={50}
                    />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload
                          return (
                            <div className="bg-white p-3 rounded-lg shadow-lg border text-xs max-w-xs">
                              <p className="font-semibold text-gray-900 mb-1">{data.fullName}</p>
                              {data.clientName && <p className="text-gray-500 text-xs mb-2">{data.clientName}</p>}
                              <div className="space-y-1">
                                <p><span className="text-gray-500">Sent:</span> <span className="font-medium">{formatNumber(data.sent)}</span></p>
                                <p><span className="text-gray-500">Opened:</span> <span className="font-medium text-blue-600">{formatNumber(data.opened)}</span> ({data.openRate}%)</p>
                                <p><span className="text-gray-500">Clicked:</span> <span className="font-medium text-green-600">{formatNumber(data.clicked)}</span> ({data.clickRate}%)</p>
                                {data.uniqueClicks !== undefined && <p><span className="text-gray-500">Unique Clicks:</span> <span className="font-medium text-purple-600">{formatNumber(data.uniqueClicks)}</span></p>}
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
                    <Bar dataKey="clicked" fill="#10B981" name="Clicks" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="uniqueClicks" fill="#8B5CF6" name="Unique Clicks" radius={[4, 4, 0, 0]} />
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

            <div className={`grid grid-cols-2 ${hasFullAccess() ? "md:grid-cols-4" : "md:grid-cols-3"} gap-4 mb-4`}>
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
              {hasFullAccess() &&
                <MetricBox
                  label="Total Cost"
                  value={formatCurrency(voicemailMetrics.overall.totalCost)}
                  icon={BarChart3}
                  color="purple"
                />
              }
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
              <div className="h-40 min-h-[180px] flex items-center justify-center">
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

      {/* SMS Performance Card */}
      {smsMetrics && smsMetrics.totalCampaigns > 0 && (
        <div className="card mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <MessageSquare className="text-purple-600" size={20} />
              SMS Performance
            </h2>
            <button
              onClick={() => {
                localStorage.setItem('selectedService', 'sms');
                navigate('/services');
              }}
              className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1"
            >
              View All <ArrowRight size={14} />
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <MetricBox label="Total Sent" value={formatNumber(smsMetrics.totalSent)} icon={MessageSquare} />
            <MetricBox label="Active Campaigns" value={formatNumber(smsMetrics.activeCampaigns)} icon={Zap} color="purple" />
            <MetricBox label="Delivered" value={formatNumber(smsMetrics.delivered)} icon={CheckCircle} color="green" />
            <MetricBox label="Failed" value={formatNumber(smsMetrics.failed)} icon={AlertTriangle} color="red" />
          </div>

          {(smsMetrics.delivered > 0 || smsMetrics.failed > 0) && (() => {
            const smsPieData = [
              smsMetrics.delivered > 0 && { name: 'Delivered', value: smsMetrics.delivered, color: '#10B981' },
              smsMetrics.failed > 0 && { name: 'Failed', value: smsMetrics.failed, color: '#EF4444' }
            ].filter(Boolean)
            return (
              <div className="h-40 min-h-[180px] flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={smsPieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={60}
                      dataKey="value"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    >
                      {smsPieData.map((entry, index) => (
                        <Cell key={`sms-cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )
          })()}
        </div>
      )}

      {hasFullAccess() && (
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <QuickActionButton
              icon={RefreshCw}
              label={isSyncing ? "Syncing..." : "Sync All Data"}
              disabled={isSyncing}
              onClick={async () => {
                try {
                  setIsSyncing(true)
                  toast.info('Syncing Mautic automation clients and voicemail data...', { autoClose: 3000 })

                  // 🚀 OPTIMIZED: Single consolidated sync endpoint
                  const response = await axios.post('/api/dashboard/sync-all?syncDropCowboy=true')

                  // Show specific results
                  if (response.data?.success) {
                    const mautic = response.data.data?.mautic
                    const dropCowboy = response.data.data?.dropCowboy

                    if (mautic?.success) {
                      toast.success(mautic.message || 'Mautic automation clients synced!', { autoClose: 4000 })
                    } else if (mautic?.message) {
                      toast.warning(mautic.message, { autoClose: 4000 })
                    }

                    if (dropCowboy?.success) {
                      toast.success('Voicemail data synced!', { autoClose: 3000 })
                    }

                    // Refresh dashboard data
                    await fetchAllData()
                  } else {
                    toast.error('Sync completed with errors')
                  }
                } catch (error) {
                  toast.error(error.response?.data?.error?.message || 'Failed to sync. Please try again.')
                } finally {
                  setIsSyncing(false)
                }
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
              onClick={() => navigate('/users')}
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
  const { formatDateTime } = useTimezone()
  // Determine if credentials are configured
  const hasCredentials = status?.hasCredentials ?? true

  // Determine sync state
  const isRecent = lastSync && (new Date() - new Date(lastSync)) < 3600000
  const neverSynced = !lastSync && hasCredentials
  const notConfigured = !hasCredentials

  // Determine indicator color and icon
  const getIndicatorState = () => {
    if (isActive) return { color: 'bg-blue-500', icon: <Loader2 size={14} className="animate-spin text-blue-600" /> }
    if (notConfigured) return { color: 'bg-red-500', icon: <XCircle size={14} className="text-red-600" /> }
    if (neverSynced) return { color: 'bg-gray-400', icon: <Clock size={14} className="text-gray-600" /> }
    if (isRecent) return { color: 'bg-green-500', icon: <CheckCircle size={14} className="text-green-600" /> }
    return { color: 'bg-yellow-500', icon: <Clock size={14} className="text-yellow-600" /> }
  }

  const indicatorState = getIndicatorState()

  // Determine display text
  const getDisplayText = () => {
    if (isActive) return 'Syncing...'
    if (notConfigured) return 'Not configured'
    if (neverSynced) return 'Never synced'
    return formatDateTime(lastSync)
  }

  return (
    <div className={`bg-white rounded-lg border ${isActive ? 'border-blue-300 bg-blue-50' : notConfigured ? 'border-red-200 bg-red-50' : 'border-gray-200'} p-3 flex items-center gap-3`}>
      {isActive ? (
        indicatorState.icon
      ) : (
        <div className={`w-2 h-2 rounded-full ${indicatorState.color}`} />
      )}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-900 flex items-center gap-2">
          {label}
          {isActive && <span className="text-xs text-blue-600 font-normal">Syncing...</span>}
        </div>
        <div className={`text-xs flex items-center gap-1 ${notConfigured ? 'text-red-600' : 'text-gray-500'}`}>
          <Clock size={10} />
          {getDisplayText()}
        </div>
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

const QuickActionButton = ({ icon: Icon, label, onClick, disabled = false }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`flex flex-col items-center gap-2 p-4 rounded-lg transition-colors ${disabled
        ? 'bg-gray-100 cursor-not-allowed opacity-60'
        : 'bg-gray-50 hover:bg-gray-100'
      }`}
  >
    {disabled ? (
      <Loader2 size={24} className="text-primary-600 animate-spin" />
    ) : (
      <Icon size={24} className="text-primary-600" />
    )}
    <span className="text-sm font-medium text-gray-700">{label}</span>
  </button>
)

export default Dashboard