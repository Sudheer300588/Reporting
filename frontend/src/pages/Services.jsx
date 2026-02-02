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
import SmsList from '../components/mautic/SmsList';
import VicidialDashboard from '../components/vicidial/pages/VicidialDashboard';
import { useAuth } from '../contexts/AuthContext';
import { usePermissions } from '../utils/permissions';


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

    // Fetch accessible clients based on user permissions
    useEffect(() => {
        const fetchAccessibleClients = async () => {
            try {
                setLoading(true);
                
                // Fetch Mautic clients (which already include .client relationship with assignments)
                const mauticRes = await axios.get("/api/mautic/clients");
                const mauticClients = mauticRes.data?.data || [];

                let accessibleClients = mauticClients;

                // For non-full-access users, restrict visibility based on permissions
                if (!hasFullAccessValue) {
                    accessibleClients = mauticClients.filter((mauticClient) => {
                        // Access the assignments through the .client relationship
                        const assignments = mauticClient.client?.assignments || [];
                        
                        if (canManageTeam) {
                            // Team managers can see clients they created or are assigned to
                            const createdByThisUser = mauticClient.createdBy?.id === user.id;
                            const assignedToUser = assignments.some(a => (a.user?.id || a.userId) === user.id);
                            return createdByThisUser || assignedToUser;
                        } else {
                            // Regular users - only assigned clients
                            return assignments.some(a => (a.user?.id || a.userId) === user.id);
                        }
                    });
                }

                // Extract IDs from filtered clients
                const clientIds = accessibleClients.map(c => c.id);
                setAccessibleClientIds(clientIds);
                
                setError(null);
            } catch (err) {
                console.error('Error fetching accessible clients:', err);
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
                                <span>Email Marketing</span>
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
                                <span>SMS Campaigns</span>
                            </button>

                            <button
                                onClick={() => setSelectedService('vicidial')}
                                className={`
                  flex items-center gap-2 px-4 py-4 border-b-2 font-medium text-sm transition-colors
                  ${selectedService === 'vicidial'
                                        ? 'border-blue-500 text-blue-600'
                                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                                    }
                `}
                            >
                                <span>Telecalling</span>
                            </button>
                        </nav>
                    </div>
                </div>
            </div>

            {/* Service Content */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {selectedService === 'dropcowboy' && (
                    <DropCowboyDashboard accessibleClientIds={accessibleClientIds} />
                )}
                {selectedService === 'mautic' && (
                    <MauticDashboard accessibleClientIds={accessibleClientIds} />
                )}
                {selectedService === 'sms' && (
                    <SmsList accessibleClientIds={accessibleClientIds} />
                )}
                {selectedService === 'vicidial' && (
                    <VicidialDashboard accessibleClientIds={accessibleClientIds} />
                )}
            </div>
        </div>
    );
}
