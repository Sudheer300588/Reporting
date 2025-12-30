import { create } from 'zustand'

const useViewLevel = create((set) => ({
    // below states are for mautic hierarchy table
    view: 'clients',
    setView: (view) => set({ view }),
    selectedClient: null,
    setSelectedClient: (selectedClient) => set({ selectedClient }),
    selectedCampaign: [],
    setSelectedCampaign: (selectedCampaign) => set({ selectedCampaign }),
    campaigns: [],
    setCampaigns: (campaigns) => set({ campaigns }),
    loadingCampaigns: false,
    setLoadingCampaigns: (loadingCampaigns) => set({ loadingCampaigns }),

    // below states are for dropcowboy hierarchy table
    dropcowboy: {
        viewLevel: 'client',
        selectedClient: null,
        selectedCampaign: null,
        campaigns: [],
        savedMetrics: [],
    },
    setDCViewLevel: (viewLevel) =>
        set((state) => ({ dropcowboy: { ...state.dropcowboy, viewLevel } })),
    setDCSelectedClient: (selectedClient) =>
        set((state) => ({ dropcowboy: { ...state.dropcowboy, selectedClient } })),
    setDCSelectedCampaign: (selectedCampaign) =>
        set((state) => ({ dropcowboy: { ...state.dropcowboy, selectedCampaign } })),
    setDCCampaigns: (campaigns) =>
        set((state) => ({ dropcowboy: { ...state.dropcowboy, campaigns } })),
    setDCMetrics: (savedMetrics) =>
        set((state) => ({ dropcowboy: { ...state.dropcowboy, savedMetrics } })),

    // for saving selectedService for metrics cards
    selectedService: null,
    setSelectedService: (selectedService) => set({ selectedService }),

    // below states are for employees hierarchy
    employeesStates: {
        currentRoute: 'dashboard',
        view: 'list',
        managerId: null,
        employeeId: null
    },
    setCurrentRoute: (currentRoute) => set((state) => ({ employeesStates: { ...state.employeesStates, currentRoute } })),
    setEmpView: (view) => set((state) => ({ employeesStates: { ...state.employeesStates, view } })),
    setActiveManagerId: (managerId) => set((state) => ({ employeesStates: { ...state.employeesStates, managerId } })),
    setActiveEmployeeId: (employeeId) => set((state) => ({ employeesStates: { ...state.employeesStates, employeeId } })),
}));

export default useViewLevel;