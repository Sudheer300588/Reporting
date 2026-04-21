/**
 * Services Page
 * 
 * Provides access to integrated third-party services:
 * - Ringless Voicemail: Ringless voicemail & AI voice analytics dashboard
 * - Mautic: Marketing automation & CRM platform
 * - VICIdial: Call center platform
 * 
 * Access Control: Users only see clients and data assigned to them
 * (unless they have Full System Access)
 */

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { DropCowboyDashboard } from '../components/dropCowboy';
import { MauticDashboard } from '../components/mautic';
import { useAuth } from '../contexts/AuthContext';
import { usePermissions } from '../utils/permissions';
import SmsSection from '../components/mautic/SmsSection';
import clientService from '../services/clientService';
import AICallingDashboard from '../components/aicalling/AICallingDashboard';
import OutboundCallingDashboard from '../components/aicalling/OutboundCallingDashboard';


export default function Services() {
    const { user } = useAuth();
    const { hasFullAccess, isTeamManager } = usePermissions(user);
    
    // Compute permission booleans OUTSIDE useEffect to avoid recreating them on every render
    const hasFullAccessValue = hasFullAccess();
    const canManageTeam = isTeamManager;
    
    // Get saved service from localStorage or default to 'dropcowboy'
    const [selectedService, setSelectedService] = useState(() => {
        const saved = localStorage.getItem('selectedService');
        return saved || 'dropcowboy';
    });

    const [accessibleClientIds, setAccessibleClientIds] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Fetch accessible clients ONCE on mount (not per service)
    useEffect(() => {
        const fetchAccessibleClients = async () => {
            try {
                setLoading(true);
                
                // ✅ Use optimized client service with caching (fetches once, cached for session)
                const unifiedClients = await clientService.getUnifiedClients();

                // Extract Mautic API IDs for filtering in service dashboards
                const clientIds = unifiedClients.map(c => c.mauticApiId).filter(Boolean);
                setAccessibleClientIds(clientIds);
                
                setError(null);
            } catch (err) {
                setError('Failed to load accessible clients');
                setAccessibleClientIds([]);
            } finally {
                setLoading(false);
            }
        };

        if (user?.id) {
            fetchAccessibleClients();
        }
    }, [user?.id]);

    // Save selected service to localStorage whenever it changes
    useEffect(() => {
        localStorage.setItem('selectedService', selectedService);
    }, [selectedService]);

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                    <p className="text-gray-600">Loading services...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="bg-white rounded-lg shadow-md p-6 max-w-md text-center">
                    <p className="text-red-600 font-medium">{error}</p>
                </div>
            </div>
        );
    }

    if (accessibleClientIds.length === 0 && !hasFullAccessValue) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="bg-white rounded-lg shadow-md p-8 max-w-md text-center">
                    <p className="text-gray-600 font-medium mb-2">No Clients Assigned</p>
                    <p className="text-gray-500 text-sm">
                        You don't have any clients assigned to you yet. 
                        Contact your administrator to get started.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Service Navigation */}
            <div className="bg-white border-b border-gray-200 sticky top-16 z-40">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-500 py-4">Services:</span>
                        <nav className="flex space-x-4" aria-label="Services">
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
                                <span>Ringless Voicemail</span>
                            </button>

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
                                <span>Email Automation</span>
                            </button>
                            <button
                                onClick={() => setSelectedService('sms')}
                                className={`
                  flex items-center gap-2 px-4 py-4 border-b-2 font-medium text-sm transition-colors
                  ${selectedService === 'sms'
                                        ? 'border-blue-500 text-blue-600'
                                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                                    }
                `}
                            >
                                <span>SMS</span>
                            </button>
                            <button
                                onClick={() => setSelectedService('aiagentcalling')}
                                className={`
                  flex items-center gap-2 px-4 py-4 border-b-2 font-medium text-sm transition-colors
                  ${selectedService === 'aiagentcalling'
                                        ? 'border-blue-500 text-blue-600'
                                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                                    }
                `}
                            >
                                <span>AI Agent Calling</span>
                            </button>
                            <button
                                onClick={() => setSelectedService('outboundcalling')}
                                className={`
                  flex items-center gap-2 px-4 py-4 border-b-2 font-medium text-sm transition-colors
                  ${selectedService === 'outboundcalling'
                                        ? 'border-blue-500 text-blue-600'
                                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                                    }
                `}
                            >
                                <span>Outbound Calling</span>
                            </button>
                        </nav>
                    </div>
                </div>
            </div>

            {/* Service Content - LAZY LOAD: Only render selected service to prevent loading all data at once */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {selectedService === 'dropcowboy' && (
                    <DropCowboyDashboard key="dropcowboy" accessibleClientIds={accessibleClientIds} />
                )}
                {selectedService === 'mautic' && (
                    <MauticDashboard key="mautic" accessibleClientIds={accessibleClientIds} />
                )}
                {selectedService === 'sms' && (
                    <SmsSection key="sms" accessibleClientIds={accessibleClientIds} />
                )}
                {selectedService === 'aiagentcalling' && (
                    <AICallingDashboard key="aiagentcalling" accessibleClientIds={accessibleClientIds} />
                )}
                {selectedService === 'outboundcalling' && (
                    <OutboundCallingDashboard key="outboundcalling" accessibleClientIds={accessibleClientIds} />
                )}
            </div>
        </div>
    );
}