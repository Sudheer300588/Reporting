/**
 * Services Page
 * 
 * Provides access to integrated third-party services:
 * - Ringless Voicemail: Ringless voicemail & AI voice analytics dashboard
 * - Mautic: Marketing automation & CRM platform
 */

import React, { useState, useEffect } from 'react';
import { DropCowboyDashboard } from '../components/dropCowboy';
import { MauticDashboard } from '../components/mautic';
import VicidialDashboard from '../components/vicidial/pages/VicidialDashboard';


export default function Services() {
    // Get saved service from localStorage or default to 'dropcowboy'
    const [selectedService, setSelectedService] = useState(() => {
        const saved = localStorage.getItem('selectedService');
        return saved || 'dropcowboy';
    });

    // Save selected service to localStorage whenever it changes
    useEffect(() => {
        localStorage.setItem('selectedService', selectedService);
    }, [selectedService]);

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
                                <span className="text-lg"></span>
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
                                <span className="text-lg"></span>
                                <span>Autovation</span>
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
                                <span className="text-lg"></span>
                                <span>Vici Dial</span>
                            </button>
                        </nav>
                    </div>
                </div>
            </div>

            {/* Service Content */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {selectedService === 'dropcowboy' && <DropCowboyDashboard />}
                {selectedService === 'mautic' && <MauticDashboard />}
                {selectedService === 'vicidial' && <VicidialDashboard />}
            </div>
        </div>
    );
}
