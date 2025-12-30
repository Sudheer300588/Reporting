import { Calendar, Megaphone, Voicemail } from 'lucide-react';

const InfoCard = ({ icon: Icon, label, value, color = 'blue' }) => {
  const colorClasses = {
    blue: { icon: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100' },
    purple: { icon: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-100' },
    green: { icon: 'text-green-600', bg: 'bg-green-50', border: 'border-green-100' },
  };

  const colors = colorClasses[color];

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 flex items-center space-x-4">
      <div className={`p-3 rounded-lg ${colors.bg} ${colors.border} border flex-shrink-0`}>
        <Icon size={20} className={colors.icon} strokeWidth={2.5} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{label}</p>
        <p className="text-sm font-semibold text-gray-900 truncate">{value || 'N/A'}</p>
      </div>
    </div>
  );
};

const CampaignInfo = ({ campaigns }) => {
  if (!campaigns || campaigns.length === 0) {
    return null;
  }

  // Get unique campaign names and voicemail names
  const campaignNames = [...new Set(campaigns.map(c => c.campaignName))].filter(Boolean);
  const voicemailNames = [...new Set(
    campaigns.flatMap(c => 
      c.voicemailName ? c.voicemailName.split(', ').filter(Boolean) : []
    )
  )];

  // Get overall date range from all campaigns
  const allDates = campaigns
    .filter(c => c.dateRange && (c.dateRange.start || c.dateRange.end))
    .map(c => c.dateRange);
  
  let dateRangeText = 'N/A';
  if (allDates.length > 0) {
    const startDates = allDates.map(d => d.start).filter(Boolean);
    const endDates = allDates.map(d => d.end).filter(Boolean);
    
    const earliestStart = startDates.length > 0 
      ? startDates.sort()[0] 
      : null;
    const latestEnd = endDates.length > 0 
      ? endDates.sort().reverse()[0] 
      : null;
    
    if (earliestStart && latestEnd) {
      dateRangeText = `${earliestStart} to ${latestEnd}`;
    } else if (earliestStart) {
      dateRangeText = `From ${earliestStart}`;
    } else if (latestEnd) {
      dateRangeText = `Until ${latestEnd}`;
    }
  }

  return (
    <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg border border-gray-200 p-6">
      <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-4">
        Campaign Information
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <InfoCard
          icon={Megaphone}
          label="Campaign Name"
          value={campaignNames.length > 0 ? campaignNames.join(', ') : 'N/A'}
          color="blue"
        />
        <InfoCard
          icon={Voicemail}
          label="Voicemail Name"
          value={voicemailNames.length > 0 ? voicemailNames.join(', ') : 'N/A'}
          color="purple"
        />
        <InfoCard
          icon={Calendar}
          label="Date Range"
          value={dateRangeText}
          color="green"
        />
      </div>
    </div>
  );
};

export default CampaignInfo;
