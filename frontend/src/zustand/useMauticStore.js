import { create } from 'zustand';

const useMauticStore = create((set) => ({
  // EMAIL CAMPAIGN STATE
  emailCampaigns: [],
  setEmailCampaigns: (emailCampaigns) => set({ emailCampaigns }),

  // EMAIL STATS CACHE (keyed by `${emailId}-${page}`)
  emailStatsCache: {},
  setEmailStats: (emailId, page, data) =>
    set((state) => ({
      emailStatsCache: {
        ...state.emailStatsCache,
        [`${emailId}-${page}`]: data,
      },
    })),

  // SMS CAMPAIGN STATE
  smsCampaigns: [],
  setSmsCampaigns: (smsCampaigns) => set({ smsCampaigns }),

  // SMS STATS CACHE (keyed by `${smsId}-${page}`)
  smsStatsCache: {},
  setSmsStats: (smsId, page, data) =>
    set((state) => ({
      smsStatsCache: {
        ...state.smsStatsCache,
        [`${smsId}-${page}`]: data,
      },
    })),

  // CONTACT ACTIVITY CACHE
  contactCache: {},
  setContactData: (contactId, smsId, data) =>
    set((state) => ({
      contactCache: {
        ...state.contactCache,
        [`${contactId}-${smsId || 'all'}`]: data,
      },
    })),

  // CLEAR ALL CACHE
  clearCache: () =>
    set({
      emailCampaigns: [],
      emailStatsCache: {},
      smsCampaigns: [],
      smsStatsCache: {},
      contactCache: {},
    }),
}));

export { useMauticStore };
export default useMauticStore;
