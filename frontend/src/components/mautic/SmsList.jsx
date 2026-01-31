import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { useMauticStore } from "../../zustand/useMauticStore";

export default function SmsList({ onCampaignSelect, clientId, onOpenStats }) {
    const navigate = useNavigate();
    const { smsCampaigns, setSmsCampaigns } = useMauticStore();
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (smsCampaigns.length > 0) return; // already cached
        setLoading(true);
        const baseUrl = import.meta.env.VITE_API_URL || "";
        axios.get(`${baseUrl}/api/mautic/smses`)
            .then((res) => setSmsCampaigns(res.data.data))
            .finally(() => setLoading(false));
    }, [smsCampaigns, setSmsCampaigns]);

    // Filter campaigns by clientId if provided (for Clients.jsx context)
    const filteredCampaigns = clientId 
        ? smsCampaigns.filter(sms => sms.clientId === clientId)
        : smsCampaigns;

    const handleRowClick = (sms) => {
        // If onOpenStats provided, open as modal (Task 3)
        if (onOpenStats) {
            onOpenStats(sms);
            return;
        }

        // If onCampaignSelect provided, use custom handler (Clients.jsx)
        if (onCampaignSelect) {
            onCampaignSelect(sms.id);
            return;
        }

        // Default: navigate (Services.jsx)
        navigate(`/sms/${sms.id}`);
    };

    if (loading) return <div className="p-8 text-gray-600">Loading...</div>;

    return (
        <div className="p-6 animate-fade-in flex flex-col bg-gradient-to-b from-white to-gray-50">
            <h1 className="text-3xl font-bold mb-6 text-gray-800">📱 SMS Campaigns</h1>

            <div className="flex-1 overflow-auto bg-white rounded-2xl border border-gray-200 shadow-md">
                <table className="w-full text-sm text-gray-700">
                    <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                            <th className="text-left py-3 px-4 font-semibold">Name</th>
                            <th className="text-left py-3 px-4 font-semibold">Category</th>
                            <th className="text-left py-3 px-4 font-semibold">Sent</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredCampaigns.length === 0 ? (
                            <tr>
                                <td colSpan="3" className="py-4 px-4 text-center text-gray-500">
                                    {clientId ? "No SMS campaigns for this client" : "No SMS campaigns found"}
                                </td>
                            </tr>
                        ) : (
                            filteredCampaigns.map((sms) => (
                                <tr
                                    key={sms.id}
                                    className="hover:bg-blue-50 cursor-pointer even:bg-gray-50"
                                    onClick={() => handleRowClick(sms)}
                                >
                                    <td className="py-3 px-4">{sms.name}</td>
                                    <td className="py-3 px-4">{sms.category?.title || "—"}</td>
                                    <td className="py-3 px-4">{sms.sentCount}</td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
