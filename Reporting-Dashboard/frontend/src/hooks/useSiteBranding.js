import { useEffect } from 'react';
import axios from 'axios';

/**
 * Custom hook to fetch and apply site branding configuration
 * Eliminates duplicate logic from App.jsx
 */
export const useSiteBranding = () => {
  useEffect(() => {
    const applyBranding = async () => {
      try {
        const res = await axios.get('/api/site-config');
        const site = res.data?.data;
        if (!site) return;

        // Apply site title
        if (site.siteTitle) {
          document.title = site.siteTitle;
        }

        // Apply favicon
        try {
          const link = document.querySelector("link[rel*='icon']") || document.createElement('link');
          link.type = 'image/x-icon';
          link.rel = 'shortcut icon';
          if (site.faviconPath) {
            link.href = site.faviconPath;
          }
          if (!document.querySelector("link[rel*='icon']")) {
            document.getElementsByTagName('head')[0].appendChild(link);
          }
        } catch (e) {
          console.warn('Failed to set favicon', e);
        }

        // Apply login background
        applyLoginBackground(site);
      } catch (err) {
        // Silently fail - branding is not critical for functionality
      }
    };

    // Initial application
    applyBranding();

    // Listen for branding updates (from Settings page)
    const handleBrandingUpdate = (event) => {
      const site = event?.detail;
      if (!site) return;

      if (site.siteTitle) {
        document.title = site.siteTitle;
      }

      try {
        const link = document.querySelector("link[rel*='icon']") || document.createElement('link');
        link.type = 'image/x-icon';
        link.rel = 'shortcut icon';
        if (site.faviconPath) {
          link.href = site.faviconPath;
        }
        if (!document.querySelector("link[rel*='icon']")) {
          document.getElementsByTagName('head')[0].appendChild(link);
        }
      } catch (e) {
        console.warn('Failed to set favicon', e);
      }

      applyLoginBackground(site);
    };

    window.addEventListener('site-settings-updated', handleBrandingUpdate);
    window.addEventListener('site-customization-updated', handleBrandingUpdate); // Support both event names

    return () => {
      window.removeEventListener('site-settings-updated', handleBrandingUpdate);
      window.removeEventListener('site-customization-updated', handleBrandingUpdate);
    };
  }, []);
};

/**
 * Apply login background based on site settings
 * @param {Object} site - Site settings object
 */
function applyLoginBackground(site) {
  let bg = '';
  
  if (site.loginBgType === 'color' && site.loginBgColor) {
    bg = site.loginBgColor;
  } else if (site.loginBgType === 'gradient' && site.loginBgGradientFrom && site.loginBgGradientTo) {
    bg = `linear-gradient(90deg, ${site.loginBgGradientFrom}, ${site.loginBgGradientTo})`;
  } else if (site.loginBgType === 'image' && site.loginBgImagePath) {
    bg = `url('${site.loginBgImagePath}') center/cover no-repeat`;
  }
  
  if (bg) {
    document.documentElement.style.setProperty('--site-login-bg', bg);
  }
}
