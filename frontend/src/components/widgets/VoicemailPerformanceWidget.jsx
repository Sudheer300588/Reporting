import { useState, useEffect, useMemo } from 'react'
import { Phone, CheckCircle, AlertTriangle, Loader2, BarChart3 } from 'lucide-react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { useMetrics } from '../../hooks/dropCowboy/useDropCowboy'

const formatNumber = (num) => {
  if (num === null || num === undefined) return '0'
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M'
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K'
  return num.toLocaleString()
}

const formatCurrency = (num) => {
  if (num === null || num === undefined) return '$0.00'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num)
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

const VoicemailPerformanceWidget = ({ clientName }) => {
  const { metrics, loading, error } = useMetrics({})
  const [clientStats, setClientStats] = useState(null)

  useEffect(() => {
    if (!metrics?.campaigns || !clientName) return

    const records = metrics.campaigns.flatMap((campaign) => {
      const campClientName = campaign.client || "Unknown"
      return campaign.records.map((record) => ({
        ...record,
        client: campClientName,
        status: record.status?.trim()?.toLowerCase() || "other",
      }))
    })

    const filteredRecords = records.filter((r) => r.client === clientName)

    const totalSent = filteredRecords.length
    const successfulDeliveries = filteredRecords.filter(r => r.status === "success").length
    const failedSends = filteredRecords.filter(r => r.status === "failure").length
    const otherStatus = filteredRecords.filter(r => !["success", "failure"].includes(r.status)).length
    
    const totalCost = filteredRecords.reduce((sum, r) => sum + (parseFloat(r.cost) || 0), 0)

    setClientStats({
      totalSent,
      successfulDeliveries,
      failedSends,
      otherStatus,
      totalCost,
      averageSuccessRate: totalSent > 0 ? ((successfulDeliveries / totalSent) * 100).toFixed(1) : 0
    })
  }, [metrics, clientName])

  const pieChartData = useMemo(() => {
    if (!clientStats) return []
    
    const data = []
    if (clientStats.successfulDeliveries > 0) {
      data.push({ name: 'Delivered', value: clientStats.successfulDeliveries, color: COLORS[0] })
    }
    if (clientStats.failedSends > 0) {
      data.push({ name: 'Failed', value: clientStats.failedSends, color: COLORS[1] })
    }
    if (clientStats.otherStatus > 0) {
      data.push({ name: 'Other', value: clientStats.otherStatus, color: COLORS[2] })
    }
    return data
  }, [clientStats])

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="animate-spin text-green-600" size={24} />
          <span className="ml-2 text-gray-600">Loading voicemail stats...</span>
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

  if (!clientStats || clientStats.totalSent === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="text-center py-4">
          <Phone className="mx-auto text-gray-400 mb-2" size={24} />
          <p className="text-sm text-gray-500">No voicemail data available for this client</p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <Phone className="text-green-600" size={20} />
          Voicemail Performance
        </h3>
        {clientName && (
          <span className="text-sm text-gray-500">{clientName}</span>
        )}
      </div>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <MetricBox 
          label="Total Sent" 
          value={formatNumber(clientStats.totalSent)} 
          icon={Phone}
        />
        <MetricBox 
          label="Delivered" 
          value={formatNumber(clientStats.successfulDeliveries)} 
          icon={CheckCircle}
          color="green"
        />
        <MetricBox 
          label="Failed" 
          value={formatNumber(clientStats.failedSends)} 
          icon={AlertTriangle}
          color="red"
        />
        <MetricBox 
          label="Total Cost" 
          value={formatCurrency(clientStats.totalCost)} 
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
                style={{ width: `${Math.min(parseFloat(clientStats.averageSuccessRate) || 0, 100)}%` }}
              />
            </div>
            <span className="text-lg font-semibold text-green-600">
              {clientStats.averageSuccessRate}%
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
  )
}

export default VoicemailPerformanceWidget