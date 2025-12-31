import { TrendingUp, CheckCircle, XCircle, DollarSign, ShieldQuestion } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext.jsx'

const MetricCard = ({ title, value, subtitle, icon: Icon, color = 'blue', clickable = false, onClick }) => {
  const colorClasses = {
    blue: { text: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100' },
    green: { text: 'text-green-600', bg: 'bg-green-50', border: 'border-green-100' },
    red: { text: 'text-red-600', bg: 'bg-red-50', border: 'border-red-100' },
    purple: { text: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-100' },
    orange: { text: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-100' },
  };

  const colors = colorClasses[color];

  return (
    <div
      className={`bg-white rounded-xl border border-gray-200/60 p-2 transition-all duration-300 inline-flex flex-col 
      ${clickable ? 'cursor-pointer hover:shadow-md hover:border-blue-300 active:scale-[0.98]' : 'hover:shadow-sm'}
      `}
      onClick={clickable ? onClick : undefined}
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{title}</p>
          <h3 className="text-xl font-bold text-gray-900 mb-1">{value}</h3>
          {subtitle && <p className="text-xs text-gray-500 font-medium">{subtitle}</p>}

        </div>
        {Icon && (
          <div className={`p-2 rounded-lg ${colors.bg} ${colors.border} border`}>
            <Icon size={16} className={colors.text} strokeWidth={2.5} />
          </div>
        )}
      </div>
    </div>
  );
};

const MetricsCards = ({ metrics, onMetricClick, viewLevel }) => {
  const { user } = useAuth();
  const showCostForSuperadmin = user && user.role === 'superadmin';

  if (!metrics || !metrics.overall) {
    return (
      <div className="flex gap-4 overflow-x-auto py-1">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200/60 p-5 animate-pulse min-w-[220px] flex-shrink-0">
            <div className="h-3 bg-gray-200 rounded w-1/2 mb-3"></div>
            <div className="h-7 bg-gray-200 rounded w-3/4 mb-2"></div>
            <div className="h-2 bg-gray-200 rounded w-1/3"></div>
          </div>
        ))}
      </div>
    );
  }

  const { overall } = metrics;
  const successRate = overall.averageSuccessRate || 0;
  const failureRate = overall.totalSent > 0 ? ((overall.failedSends / overall.totalSent) * 100) : 0;
  const otherRate = overall.totalSent > 0 ? ((overall.otherStatus / overall.totalSent) * 100) : 0;

  return (
    // Use a horizontal single-line layout with horizontal scrolling on small viewports
    <div className={`grid ${showCostForSuperadmin ? 'grid-cols-5' : 'grid-cols-4'} gap-4 overflow-x-auto py-1`}>
      <MetricCard
        title="Total VoiceMails Sent"
        value={overall.totalSent.toLocaleString()}
        subtitle={`${overall.totalSent} Ringless voicemails`}
        icon={TrendingUp}
        color="blue"
        clickable={viewLevel === 'campaign'}
        onClick={() => viewLevel === 'campaign' && onMetricClick('all')}
      />
      <MetricCard
        title="Successful Deliveries"
        value={overall.successfulDeliveries.toLocaleString()}
        subtitle={`${successRate.toFixed(1)}% delivery rate`}
        icon={CheckCircle}
        color="green"
        clickable={viewLevel === 'campaign'}
        onClick={() => viewLevel === 'campaign' && onMetricClick('success')}
      />
      <MetricCard
        title="Failed Deliveries"
        value={overall.failedSends.toLocaleString()}
        subtitle={`${failureRate.toFixed(1)}% failure rate`}
        icon={XCircle}
        color="red"
        clickable={viewLevel === 'campaign'}
        onClick={() => viewLevel === 'campaign' && onMetricClick('failure')}
      />
      <MetricCard
        title="Other Status"
        value={overall.otherStatus?.toLocaleString() || '0'}
        subtitle={`${otherRate.toFixed(1)}% other status`}
        icon={ShieldQuestion}
        color="orange"
        clickable={viewLevel === 'campaign'}
        onClick={() => viewLevel === 'campaign' && onMetricClick('other')}
      />
      {showCostForSuperadmin && (
        <MetricCard
          title="Total Campaign Cost"
          value={`$${(overall.totalCost || 0).toFixed(2)}`}
          subtitle={`$${(overall.totalCost / overall.totalSent || 0).toFixed(4)} per voicemail`}
          icon={DollarSign}
          color="purple"
        />
      )}
    </div>
  );
};

export default MetricsCards;