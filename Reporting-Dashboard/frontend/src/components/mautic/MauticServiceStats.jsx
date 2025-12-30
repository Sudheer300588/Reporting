import { Mail, List, Send } from 'lucide-react';
import { formatNumber } from '../../utils/mautic';


const MauticServiceStats = ({ selectedClient }) => {
    const cards = [
        {
            title: 'Total Emails',
            value: formatNumber(selectedClient.totalEmails),
            icon: Mail,
            color: 'bg-indigo-500',
        },
        {
            title: 'Total Campaigns',
            value: formatNumber(selectedClient.totalCampaigns || 0),
            icon: Send,
            color: 'bg-purple-500',
        },
        {
            title: 'Total Segments',
            value: formatNumber(selectedClient.totalSegments),
            icon: List,
            color: 'bg-green-500',
        }
    ];

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {cards.map((card, index) => {
                const Icon = card.icon;
                return (
                    <div
                        key={index}
                        className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 hover:shadow-md transition-shadow"
                    >
                        <div className="flex items-start justify-between">
                            <div className="flex-1">
                                <p className="text-sm font-medium text-gray-600 mb-1">
                                    {card.title}
                                </p>
                                <p className="text-xl font-bold text-gray-900">
                                    {card.value}
                                </p>
                            </div>
                            <div className={`${card.color} p-3 rounded-lg`}>
                                <Icon className="text-white" size={20} />
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

export default MauticServiceStats