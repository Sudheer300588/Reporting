/**
 * Metrics Cards Component
 * 
 * Display key metrics in card format
 */

import { Users, Mail, List, Send } from 'lucide-react';
import { formatNumber } from '../../utils/mautic';

export default function MetricsCards({ metrics }) {
  const { overview, emailStats } = metrics;

  const cards = [
    {
      title: 'Total Emails',
      value: formatNumber(overview.totalEmails),
      icon: Mail,
      color: 'bg-indigo-500',
      subtitle: `${formatNumber(emailStats.totalSent)} sent to contacts`
    },
    {
      title: 'Total Campaigns',
      value: formatNumber(overview.totalCampaigns || 0),
      icon: Send,
      color: 'bg-purple-500',
      subtitle: 'Marketing campaigns'
    },
    {
      title: 'Total Segments',
      value: formatNumber(overview.totalSegments),
      icon: List,
      color: 'bg-green-500',
      subtitle: `Across ${overview.clients} client${overview.clients !== 1 ? 's' : ''}`
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {cards.map((card, index) => {
        const Icon = card.icon;
        return (
          <div
            key={index}
            className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-600 mb-1">
                  {card.title}
                </p>
                <p className="text-3xl font-bold text-gray-900">
                  {card.value}
                </p>
                <p className="text-xs text-gray-500 mt-2">
                  {card.subtitle}
                </p>
              </div>
              <div className={`${card.color} p-3 rounded-lg`}>
                <Icon className="text-white" size={24} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}