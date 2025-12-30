/**
 * Centralized Zustand Store
 * Consolidates all application state management
 * 
 * WHY: Replacing Context API with Zustand for:
 * - Better performance (no unnecessary re-renders)
 * - Simpler API
 * - DevTools support
 * - Persistence support
 */

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import axios from 'axios';

/**
 * Auth Store
 * Manages user authentication and user data
 */
export const useAuthStore = create(
  devtools(
    (set, get) => ({
      user: null,
      loading: true,
      isAuthenticated: false,

      // Set user data (from login or token verification)
      setUser: (user) => set({ user, isAuthenticated: !!user, loading: false }),

      // Clear user data (logout)
      clearUser: () => set({ user: null, isAuthenticated: false, loading: false }),

      // Set loading state
      setLoading: (loading) => set({ loading }),

      // Check authentication status
      checkAuth: async () => {
        try {
          const response = await axios.get('/api/auth/me', { withCredentials: true });
          get().setUser(response.data.user);
          return true;
        } catch (error) {
          get().clearUser();
          return false;
        }
      },

      // Login action
      login: async (email, password) => {
        try {
          const response = await axios.post('/api/auth/login', 
            { email, password },
            { withCredentials: true }
          );
          get().setUser(response.data.user);
          return { success: true };
        } catch (error) {
          const message = error.response?.data?.error?.message || 
                         error.response?.data?.message || 
                         'Login failed';
          return { success: false, message, error: error.response?.data?.error };
        }
      },

      // Logout action
      logout: async () => {
        try {
          await axios.post('/api/auth/logout', {}, { withCredentials: true });
        } catch (error) {
          // Ignore errors on logout
        } finally {
          get().clearUser();
        }
      },
    }),
    { name: 'AuthStore' }
  )
);

/**
 * UI Store
 * Manages UI state (modals, sidebars, themes, etc.)
 */
export const useUIStore = create(
  devtools(
    persist(
      (set) => ({
        sidebarOpen: true,
        theme: 'light',
        notifications: [],

        toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
        setTheme: (theme) => set({ theme }),
        addNotification: (notification) => 
          set((state) => ({ 
            notifications: [...state.notifications, { ...notification, id: Date.now() }] 
          })),
        removeNotification: (id) =>
          set((state) => ({
            notifications: state.notifications.filter((n) => n.id !== id)
          })),
        clearNotifications: () => set({ notifications: [] }),
      }),
      {
        name: 'ui-storage',
        partialize: (state) => ({ theme: state.theme }), // Only persist theme
      }
    ),
    { name: 'UIStore' }
  )
);

/**
 * View Level Store (existing)
 * Keep for backward compatibility with hierarchy views
 */
export const useViewLevelStore = create(
  devtools(
    (set) => ({
      employeesStates: {
        currentRoute: '/',
      },
      setCurrentRoute: (route) =>
        set((state) => ({
          employeesStates: { ...state.employeesStates, currentRoute: route },
        })),
    }),
    { name: 'ViewLevelStore' }
  )
);
