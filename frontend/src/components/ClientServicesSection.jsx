import { useEffect } from "react";
import { Mail, PhoneOff, ArrowLeft } from "lucide-react";
import DropCowboyServiceStats from "./dropCowboy/DropCowboyServiceStats";
import MauticServiceStats from "./mautic/MauticServiceStats";
import EmailPerformanceWidget from "./widgets/EmailPerformanceWidget";
import VoicemailPerformanceWidget from "./widgets/VoicemailPerformanceWidget";
import useViewLevel from "../zustand/useViewLevel";

const ClientServicesSection = ({ selectedClient, goBackToClients, openMauticCampaigns, openDropcowboyCampaigns }) => {

    const { selectedService, setSelectedService } = useViewLevel();
    
    // Reset selectedService when client changes to ensure correct widget visibility
    useEffect(() => {
        // Always reset to the first available service when client changes
        const defaultService = selectedClient.services[0] || 'mautic';
        setSelectedService(defaultService);
    }, [selectedClient.uniqueId]); // Only trigger when client changes (using uniqueId)

    return (
        <div className="animate-fade-in">
            {/* Back Button */}
            <button
                onClick={goBackToClients}
                className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
            >
                <ArrowLeft className="w-5 h-5" />
                <span className="font-medium">Back to Clients</span>
            </button>

            {/* Service selector for metric cards */}
            <div className="bg-white border-b border-gray-200 sticky z-40">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-500 py-4">Service Stats:</span>
                        <nav className="flex space-x-4" aria-label="Services">
                            {selectedClient.services.includes('mautic') ?
                                <button
                                    onClick={() => setSelectedService('mautic')}
                                    className={`
                  flex items-center gap-2 px-4 py-4 border-b-2 font-medium text-sm transition-colors
                  ${selectedService === 'mautic'
                                            ? 'border-blue-500 text-blue-600'
                                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                                        }
                `}
                                >
                                    <span className="text-lg"></span>
                                    <span>Autovation</span>
                                </button>
                                : <></>
                            }

                            {selectedClient.services.includes('dropcowboy') ?
                                <button
                                    onClick={() => setSelectedService('dropcowboy')}
                                    className={`
                  flex items-center gap-2 px-4 py-4 border-b-2 font-medium text-sm transition-colors
                  ${selectedService === 'dropcowboy'
                                            ? 'border-blue-500 text-blue-600'
                                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                                        }
                `}
                                >
                                    <span className="text-lg"></span>
                                    <span>Ringless Voicemail</span>
                                </button>
                                : <></>
                            }
                        </nav>
                    </div>
                </div>
            </div>

            {/* metrics in service level view */}
            <div className="my-2 flex flex-col w-full p-1 bg-blue-50 border border-gray-100 rounded-md">
                {selectedService === 'dropcowboy' && <DropCowboyServiceStats selectedClient={selectedClient} />}

                {selectedService === 'mautic' && <MauticServiceStats selectedClient={selectedClient} />}
            </div>

            {/* Performance Widgets */}
            <div className="my-4">
                {/* Debug - remove after fixing */}
                {(() => {
                    const debugInfo = `selectedService: ${selectedService}, mauticApiId: ${selectedClient.mauticApiId}, name: ${selectedClient.name}`;
                    console.log('DEBUG:', debugInfo);
                    // Uncomment next line to see alert popup
                    // alert(debugInfo);
                    return null;
                })()}
                {selectedService === 'mautic' && selectedClient.mauticApiId && (
                    <EmailPerformanceWidget 
                        clientId={selectedClient.mauticApiId} 
                        clientName={selectedClient.name} 
                    />
                )}

                {selectedService === 'dropcowboy' && (
                    <VoicemailPerformanceWidget 
                        clientName={selectedClient.name} 
                    />
                )}
            </div>

            {/* Header */}
            <div className="mb-6">
                <h1 className="text-3xl font-bold text-gray-900">Select Service</h1>
                <p className="text-gray-500 mt-20s0 text-sm">
                    Choose a service for <span className="font-semibold">{selectedClient.name}</span>
                </p>
            </div>

            {/* Services Table */}
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Service</th>
                            <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Description</th>
                            <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">Status</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {/* Mautic Service */}
                        <tr
                            className={`transition-colors ${selectedClient.services.includes('mautic') ? 'hover:bg-gray-50 cursor-pointer' : 'cursor-not-allowed opacity-70 bg-gray-200 hover:bg-gray-200'}`}
                            onClick={selectedClient.services.includes('mautic') ? openMauticCampaigns : undefined}
                        >
                            <td className="px-4 py-3 flex items-center gap-3">
                                <div className="p-3 bg-blue-100 rounded-lg">
                                    <Mail className="w-6 h-6 text-blue-600" />
                                </div>
                                <span className="text-gray-900 font-medium">Autovation</span>
                            </td>
                            <td className="px-4 py-3 text-gray-600">Email Marketing Campaigns</td>
                            <td className="px-4 py-3 text-center">
                                <span className="flex items-center justify-center gap-2">
                                    <span className={`w-3 h-3 rounded-full ${selectedClient.isActive ? "bg-green-500" : "bg-gray-400"}`}></span>
                                    <span className="text-sm font-medium">
                                        {selectedClient.isActive ? "Active" : "Inactive"}
                                    </span>
                                </span>
                            </td>
                        </tr>

                        {/* Ringless Voicemail Service */}
                        <tr
                            className={`transition-colors ${selectedClient.services.includes('dropcowboy') ? 'hover:bg-gray-50 cursor-pointer' : 'cursor-not-allowed opacity-70 bg-gray-100 hover:bg-gray-100'}`}
                            onClick={selectedClient.services.includes('dropcowboy') ? openDropcowboyCampaigns : undefined}
                        >
                            <td className="px-4 py-3 flex items-center gap-3">
                                <div className="p-3 bg-green-100 rounded-lg">
                                    <PhoneOff className="w-6 h-6 text-green-500" />
                                </div>
                                <span className="text-gray-900 font-medium">Ringless Voicemail</span>
                            </td>
                            <td className="px-4 py-3 text-gray-600">Voicemail Campaigns</td>
                            <td className="px-4 py-3 text-center">
                                <span className="flex items-center justify-center gap-2">
                                    <span className={`w-3 h-3 rounded-full ${selectedClient.isActive ? "bg-green-500" : "bg-gray-400"}`}></span>
                                    <span className="text-sm font-medium">
                                        {selectedClient.isActive ? "Active" : "Inactive"}
                                    </span>
                                </span>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    )
}

export default ClientServicesSection