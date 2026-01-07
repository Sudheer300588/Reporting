import { Mail, List, Send, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { formatNumber } from '../../utils/mautic';
import mauticService from '../../services/mautic/mauticService';


const MauticServiceStats = ({ selectedClient, metrics }) => {
    // Prefer metrics.overview.totalContacts (parent-provided), then explicit fields on selectedClient,
    // then fallback to fetching. Keep state so UI updates when metrics arrive.
    const initialContacts = metrics?.overview?.totalContacts ?? (
        typeof selectedClient?.totalContacts === 'number'
            ? selectedClient.totalContacts
            : (typeof selectedClient?.segmentContactCount === 'number' ? selectedClient.segmentContactCount : null)
    );

    const [contactsCount, setContactsCount] = useState(initialContacts);

    useEffect(() => {
        let mounted = true;

        // If parent-provided metrics has the value, use it immediately
        if (metrics?.overview && typeof metrics.overview.totalContacts === 'number') {
            setContactsCount(metrics.overview.totalContacts);
            return () => { mounted = false };
        }

        // If selectedClient includes explicit counts, prefer those
        if (typeof selectedClient?.totalContacts === 'number') {
            setContactsCount(selectedClient.totalContacts);
            return () => { mounted = false };
        }
        if (typeof selectedClient?.segmentContactCount === 'number') {
            setContactsCount(selectedClient.segmentContactCount);
            return () => { mounted = false };
        }

        // Otherwise fetch dashboard metrics for this single client to get totalContacts (same source as MetricsCards)
        const fetchMetrics = async () => {
            const clientId = selectedClient?.mauticApiId || selectedClient?.id || selectedClient?.clientId;
            if (!clientId) return;
            try {
                const res = await mauticService.getDashboardMetrics(clientId);
                if (mounted && res.success && res.data?.overview) {
                    setContactsCount(res.data.overview.totalContacts || 0);
                }
            } catch (err) {
                console.error('Failed to fetch client dashboard metrics for contacts:', err);
                if (mounted) setContactsCount(0);
            }
        };

        fetchMetrics();

        return () => { mounted = false };
    }, [selectedClient, metrics]);

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
        ,{
            title: 'Total Contacts',
            value: formatNumber(contactsCount || 0),
            icon: Users,
            color: 'bg-teal-500',
        }
    ];

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