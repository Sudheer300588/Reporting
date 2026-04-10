import { useState, useEffect } from 'react';
import { Users, Mail, List, Send, Loader2 } from 'lucide-react';
import { formatNumber } from '../../utils/mautic';
import axios from 'axios';

const MauticServiceStats = ({ selectedClient }) => {
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchStats = async () => {
            if (!selectedClient?.mauticApiId) {
                setLoading(false);
                return;
            }

            try {
                setLoading(true);
                const response = await axios.get('/api/mautic/dashboard', {
                    params: { clientId: selectedClient.mauticApiId }
                });
                
                if (response.data?.success) {
                    const clientData = response.data.data?.overview?.clientsData?.[0] || {};
                    setStats({
                        totalContacts: clientData.totalContacts || 0,
                        totalEmails: clientData.totalEmails || 0,
                        totalCampaigns: clientData.totalCampaigns || 0,
                        totalSegments: clientData.totalSegments || 0,
                    });
                }
            } catch (error) {
                setStats({
                    totalContacts: 0,
                    totalEmails: 0,
                    totalCampaigns: 0,
                    totalSegments: 0,
                });
            } finally {
                setLoading(false);
            }
        };

        fetchStats();
    }, [selectedClient?.mauticApiId]);

    const cards = [
        {
            title: 'Total Contacts',
            value: formatNumber(stats?.totalContacts || 0),
            icon: Users,
            color: 'bg-blue-500',
        },
        {
            title: 'Total Emails',
            value: formatNumber(stats?.totalEmails || 0),
            icon: Mail,
            color: 'bg-indigo-500',
        },
        {
            title: 'Total Campaigns',
            value: formatNumber(stats?.totalCampaigns || 0),
            icon: Send,
            color: 'bg-purple-500',
        },
        {
            title: 'Total Segments',
            value: formatNumber(stats?.totalSegments || 0),
            icon: List,
            color: 'bg-green-500',
        }
    ];

    if (loading) {
        return (
            <div className="flex items-center justify-center py-4">
                <Loader2 className="animate-spin text-blue-600 mr-2" size={20} />
                <span className="text-sm text-gray-600">Loading stats...</span>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2">
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