import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Activity, TrendingUp } from 'lucide-react';

const COLORS = ['#5FD97A', '#FF6B6B', '#4A9EFF', '#FFA500', '#9B59B6'];

const CampaignCharts = ({ metrics }) => {
  if (!metrics || !metrics.campaigns || metrics.campaigns.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-center h-64 text-gray-400">
          <Activity size={48} className="mr-3" />
          <span>No campaign data available</span>
        </div>
      </div>
    );
  }

  // Prepare data for bar chart
  const campaignData = metrics.campaigns.map(campaign => ({
    name: campaign.campaignName.substring(0, 20) + (campaign.campaignName.length > 20 ? '...' : ''),
    fullName: campaign.campaignName,
    sent: campaign.totalSent,
    success: campaign.successfulDeliveries,
    failed: campaign.failedSends,
  }));

  // Prepare data for pie chart (overall distribution)
  const statusData = [
    { name: 'Successful', value: metrics.overall.successfulDeliveries, color: '#5FD97A' },
    { name: 'Failed', value: metrics.overall.failedSends, color: '#FF6B6B' },
  ];

  // Prepare carrier distribution if available
  const carrierData = [];
  if (metrics.campaigns[0] && metrics.campaigns[0].carriers) {
    Object.entries(metrics.campaigns[0].carriers).forEach(([carrier, count]) => {
      carrierData.push({ name: carrier, value: count });
    });
  }

  return (
    <div className="space-y-4">
      {/* Campaign Performance Bar Chart */}
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <h3 className="text-sm font-medium text-gray-900 mb-4">Campaign Performance</h3>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={campaignData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f5" />
            <XAxis 
              dataKey="name" 
              tick={{ fontSize: 11 }}
              angle={-45}
              textAnchor="end"
              height={80}
            />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: '#fff', 
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '12px'
              }}
              labelFormatter={(label, payload) => {
                if (payload && payload[0]) {
                  return payload[0].payload.fullName;
                }
                return label;
              }}
            />
            <Legend wrapperStyle={{ fontSize: '12px' }} />
            <Bar dataKey="success" fill="#10b981" name="Successful" radius={[4, 4, 0, 0]} />
            <Bar dataKey="failed" fill="#ef4444" name="Failed" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Pie Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Success/Failure Distribution */}
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <h3 className="text-sm font-medium text-gray-900 mb-4">Status Distribution</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={statusData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(1)}%`}
                outerRadius={70}
                fill="#8884d8"
                dataKey="value"
                style={{ fontSize: '12px' }}
              >
                {statusData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#fff', 
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '12px'
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Carrier Distribution (if available) */}
        {carrierData.length > 0 && (
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <h3 className="text-sm font-medium text-gray-900 mb-4">Carrier Distribution</h3>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={carrierData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name.substring(0, 12)}: ${(percent * 100).toFixed(0)}%`}
                  outerRadius={70}
                  fill="#8884d8"
                  dataKey="value"
                  style={{ fontSize: '11px' }}
                >
                  {carrierData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#fff', 
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '12px'
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
};

export default CampaignCharts;
