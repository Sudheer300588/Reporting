import { useState, useEffect, useMemo } from 'react'
import { MessageSquare, CheckCircle, AlertTriangle, Loader2, Zap } from 'lucide-react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import axios from 'axios'

const formatNumber = (num) => {
  if (num === null || num === undefined) return '0'
  if (num >= 1000000) return (Math.floor(num / 100000) / 10).toFixed(1) + 'M'
  if (num >= 1000) return (Math.floor(num / 100) / 10).toFixed(1) + 'K'
  return num.toLocaleString()
}

const MetricBox = ({ label, value, icon: Icon, color = 'gray' }) => {
  const colorClasses = {
    gray: 'bg-gray-100 text-gray-600',
    green: 'bg-green-100 text-green-600',
    blue: 'bg-blue-100 text-blue-600',
    red: 'bg-red-100 text-red-600',
    purple: 'bg-purple-100 text-purple-600'
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

const COLORS = ['#10B981', '#EF4444', '#F59E0B']

const SmsPerformanceWidget = ({ clientId, clientName }) => {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [stats, setStats] = useState(null)

  useEffect(() => {
    if (!clientId) { setLoading(false); return }

    const fetchStats = async () => {
      try {
        setLoading(true)
        setError(null)
        const res = await axios.get(`/api/sms/clients/${clientId}/stats`)
        if (res.data?.success) {
          setStats(res.data.data)
        } else {
          setError('Failed to load SMS stats')
        }
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to load SMS stats')
      } finally {
        setLoading(false)
      }
    }

    fetchStats()
  }, [clientId])

  const pieChartData = useMemo(() => {
    if (!stats) return []
    const data = []
    if (stats.delivered > 0) data.push({ name: 'Delivered', value: stats.delivered, color: COLORS[0] })
    if (stats.failed > 0) data.push({ name: 'Failed', value: stats.failed, color: COLORS[1] })
    return data
  }, [stats])

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="animate-spin text-purple-600" size={24} />
          <span className="ml-2 text-gray-600">Loading SMS stats...</span>
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

  if (!stats || stats.totalSent === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="text-center py-4">
          <MessageSquare className="mx-auto text-gray-400 mb-2" size={24} />
          <p className="text-sm text-gray-500">No SMS data available for this client</p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-600 flex items-center gap-2">
          <MessageSquare className="text-purple-600" size={20} />
          SMS Performance
        </h3>
        {clientName && (
          <span className="font-bold bg-purple-100 px-2 rounded text-gray-700">{clientName}</span>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <MetricBox label="Total Sent" value={formatNumber(stats.totalSent)} icon={MessageSquare} />
        <MetricBox label="Active Campaigns" value={formatNumber(stats.activeCampaigns)} icon={Zap} color="purple" />
        <MetricBox label="Delivered" value={formatNumber(stats.delivered)} icon={CheckCircle} color="green" />
        <MetricBox label="Failed" value={formatNumber(stats.failed)} icon={AlertTriangle} color="red" />
      </div>

      {pieChartData.length > 0 && (
        <div className="h-48 flex items-center justify-center">
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
  )
}

export default SmsPerformanceWidget
