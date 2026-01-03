import { useState, useEffect, useMemo } from 'react'
import axios from 'axios'
import { Mail, CheckCircle, TrendingUp, AlertTriangle, Loader2 } from 'lucide-react'
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts'

const formatNumber = (num) => {
  if (num === null || num === undefined) return '0'
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M'
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K'
  return num.toLocaleString()
}

const MetricBox = ({ label, value, icon: Icon, color = 'gray' }) => {
  const colorClasses = {
    gray: 'bg-gray-100 text-gray-600',
    green: 'bg-green-100 text-green-600',
    blue: 'bg-blue-100 text-blue-600',
    red: 'bg-red-100 text-red-600'
  }

  return (
    <div className="bg-gray-50 rounded-lg p-3">
      <div className="flex items-center gap-2 mb-1">
        <div className={`p-1.5 rounded ${colorClasses[color]}`}>
          <Icon size={14} />
        </div>
        <span className="text-xs text-gray-500">{label}</span>
      </div>
      <div className="text-lg font-semibold text-gray-900">{value}</div>
    </div>
  )
}

const RateBox = ({ label, value, isNegative = false }) => (
  <div className="text-center p-2 bg-gray-50 rounded-lg">
    <div className="text-xs text-gray-500 mb-1">{label}</div>
    <div className={`text-lg font-bold ${isNegative ? 'text-red-600' : 'text-blue-600'}`}>
      {typeof value === 'number' ? value.toFixed(1) : '0'}%
    </div>
  </div>
)

const EmailPerformanceWidget = ({ clientId, clientName }) => {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [stats, setStats] = useState(null)

  useEffect(() => {
    const fetchClientStats = async () => {
      if (!clientId) return
      
      setLoading(true)
      setError(null)
      
      try {
        const response = await axios.get(`/api/mautic/clients/${clientId}/stats`)
        if (response.data?.success) {
          setStats(response.data.data)
        } else {
          setError('Failed to load email stats')
        }
      } catch (err) {
        console.error('Error fetching client email stats:', err)
        setError(err.response?.data?.message || 'Failed to load email stats')
      } finally {
        setLoading(false)
      }
    }

    fetchClientStats()
  }, [clientId])

  const truncateName = (name, maxLen = 20) => {
    if (!name || name.length <= maxLen) return name
    const lastSpaceIdx = name.lastIndexOf(' ')
    if (lastSpaceIdx > 0 && lastSpaceIdx > name.length - 10) {
      const suffix = name.substring(lastSpaceIdx)
      const prefixLen = maxLen - suffix.length - 3
      if (prefixLen > 5) {
        return name.substring(0, prefixLen) + '...' + suffix
      }
    }
    return name.substring(0, maxLen - 3) + '...'
  }

  const emailChartData = useMemo(() => {
    if (!stats?.topEmails) return []
    
    return stats.topEmails.slice(0, 5).map((email, index) => {
      const emailStats = email.stats || {}
      return {
        name: truncateName(email.name) || `Email ${index + 1}`,
        fullName: email.name,
        sent: emailStats.sent || email.sentCount || 0,
        opened: emailStats.read || email.readCount || 0,
        clicked: emailStats.clicked || email.clickedCount || 0,
        bounced: emailStats.bounced || email.bounced || 0,
        unsubscribed: emailStats.unsubscribed || email.unsubscribed || 0,
        openRate: typeof emailStats.openRate === 'number' ? emailStats.openRate.toFixed(1) : 
                  typeof email.readRate === 'number' ? email.readRate.toFixed(1) : '0',
        clickRate: typeof emailStats.clickRate === 'number' ? emailStats.clickRate.toFixed(1) : 
                   typeof email.clickRate === 'number' ? email.clickRate.toFixed(1) : '0',
        unsubRate: typeof emailStats.unsubscribeRate === 'number' ? emailStats.unsubscribeRate.toFixed(1) : 
                   typeof email.unsubscribeRate === 'number' ? email.unsubscribeRate.toFixed(1) : '0'
      }
    })
  }, [stats])

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="animate-spin text-blue-600" size={24} />
          <span className="ml-2 text-gray-600">Loading email stats...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="text-center py-4">
          <AlertTriangle className="mx-auto text-red-500 mb-2" size={24} />
          <p className="text-sm text-gray-600">{error}</p>
        </div>
      </div>
    )
  }

  const clientStats = stats?.stats || {}
  const sentCount = Number(clientStats.sent) || 0
  const hasData = sentCount > 0 || (stats?.topEmails?.length > 0)

  if (!hasData) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="text-center py-4">
          <Mail className="mx-auto text-gray-400 mb-2" size={24} />
          <p className="text-sm text-gray-500">No email data available for this client</p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <Mail className="text-blue-600" size={20} />
          Email Performance
        </h3>
        {clientName && (
          <span className="text-sm text-gray-500">{clientName}</span>
        )}
      </div>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <MetricBox 
          label="Total Sent" 
          value={formatNumber(clientStats.sent)} 
          icon={Mail}
        />
        <MetricBox 
          label="Opened" 
          value={formatNumber(clientStats.read)} 
          icon={CheckCircle}
          color="green"
        />
        <MetricBox 
          label="Clicked" 
          value={formatNumber(clientStats.clicked)} 
          icon={TrendingUp}
          color="blue"
        />
        <MetricBox 
          label="Bounced" 
          value={formatNumber(clientStats.bounced)} 
          icon={AlertTriangle}
          color="red"
        />
      </div>

      <div className="grid grid-cols-3 gap-2 mb-4">
        <RateBox label="Open Rate" value={clientStats.avgOpenRate || clientStats.openRate} />
        <RateBox label="Click Rate" value={clientStats.avgClickRate || clientStats.clickRate} />
        <RateBox label="Unsub Rate" value={clientStats.avgUnsubscribeRate || clientStats.unsubscribeRate} isNegative />
      </div>

      {emailChartData.length > 0 && (
        <>
          <div className="text-sm font-medium text-gray-700 mb-2">Top Emails by Volume</div>
          <div className="relative w-full" style={{ height: '200px', minWidth: '300px' }}>
            <ResponsiveContainer width="100%" height={200} debounce={50} minWidth={300}>
              <BarChart data={emailChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip 
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload
                      return (
                        <div className="bg-white p-3 rounded-lg shadow-lg border text-xs max-w-xs">
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
        </>
      )}
    </div>
  )
}

export default EmailPerformanceWidget