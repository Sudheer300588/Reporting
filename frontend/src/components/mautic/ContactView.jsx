import { useEffect, useState } from "react";
import { useParams, useSearchParams, useNavigate, useLocation } from "react-router-dom";
import axios from "axios";
import { ArrowLeft, X } from "lucide-react";
import { useMauticStore } from "../../zustand/useMauticStore";

export default function ContactView({ contactId: propContactId, smsId: propSmsId, onBack }) {
    // Support both route params and prop-based usage
    const { id: routeId } = useParams();
    const [searchParams] = useSearchParams();
    const id = propContactId || routeId;
    const smsId = propSmsId || searchParams.get("smsId");
    const location = useLocation();

    const navigate = useNavigate();
    const { contactCache, setContactData } = useMauticStore();

    const [contact, setContact] = useState(null);
    const [loading, setLoading] = useState(true);
    const key = `${id}-${smsId || "all"}`;

    useEffect(() => {
        const cached = contactCache[key];
        if (cached) {
            setContact(cached);
            setLoading(false);
            return;
        }

        const baseUrl = import.meta.env.VITE_API_URL || "";
        axios.get(`${baseUrl}/api/mautic/contact/${id}`, { params: { smsId } })
            .then((res) => {
                setContactData(id, smsId, res.data);
                setContact(res.data);
            })
            .catch((err) => console.error("Error fetching contact:", err))
            .finally(() => setLoading(false));
    }, [id, smsId, key, contactCache, setContactData]);

    // handle loading / error safely
    if (loading) return <div className="p-8 text-gray-600">Loading contact...</div>;
    if (!contact) return <div className="p-8 text-red-500">No contact found</div>;

    const events = contact.events || [];

    const sentMessages = events.filter((e) => e.event === "sms.sent");
    const replies = events.filter((e) => e.event === "sms_reply");

    // Show back button only if opened via /sms/... route (Services page)
    const isStandaloneRoute = location.pathname.startsWith("/contact/");

    const content = (
        <div className="w-full h-[calc(100vh-90px)] animate-fade-in flex flex-col">
            {/* Optional Back Button (only for standalone route usage) */}
            {isStandaloneRoute && (
                <div className="flex items-center justify-between mb-4">
                    <button
                        onClick={() => {smsId ? navigate(`/sms/${smsId}`) : navigate(-1)}}
                        className="flex items-center gap-2 text-gray-700 hover:text-blue-600 font-semibold transition-colors cursor-pointer"
                    >
                        <ArrowLeft size={18} />
                        <span>Back</span>
                    </button>
                </div>
            )}

            {/* Header */}
            <h1 className="text-3xl font-bold text-gray-800 tracking-tight">
                👤 {contact?.name ? contact.name : `Contact #${id}`}
            </h1>
            {smsId && (
                <p className="text-gray-500 mb-6">
                    Messages for SMS ID <span className="font-semibold">#{smsId}</span>
                </p>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-auto space-y-6">
                {/* Sent Messages */}
                <div className="bg-blue-50 p-6 rounded-xl shadow-sm border border-blue-100">
                    <h2 className="font-semibold text-blue-900 mb-3">Sent Messages</h2>
                    {sentMessages.length === 0 ? (
                        <p className="text-gray-600">No messages sent for this campaign</p>
                    ) : (
                        sentMessages.map((msg) => (
                            <div
                                key={msg.eventId}
                                className="bg-white p-4 rounded-lg border border-gray-200 mb-3 shadow-sm"
                            >
                                <p className="text-gray-800 whitespace-pre-line">
                                    {msg.details?.stat?.message || msg.details?.message}
                                </p>
                                <p className="text-xs text-gray-400 mt-1">{msg.timestamp}</p>
                            </div>
                        ))
                    )}
                </div>

                {/* Replies */}
                <div className="bg-green-50 p-6 rounded-xl shadow-sm border border-green-100">
                    <h2 className="font-semibold text-green-900 mb-3">Replies</h2>
                    {replies.length === 0 ? (
                        <p className="text-gray-600">No replies yet</p>
                    ) : (
                        replies.map((msg) => (
                            <div
                                key={msg.eventId}
                                className="bg-white p-4 rounded-lg border border-gray-200 mb-3 shadow-sm"
                            >
                                <p className="text-gray-800 whitespace-pre-line">
                                    {msg.details?.stat?.message || msg.details?.message}
                                </p>
                                <p className="text-xs text-gray-400 mt-1">{msg.timestamp}</p>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );

    // Return full page layout
    return (
        <div className="w-full h-full flex flex-col p-6">
            {content}
        </div>
    );
}
