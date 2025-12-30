import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Apply any saved site customization (favicon, title, login background)
const applySavedCustomization = () => {
  try {
    const raw = localStorage.getItem('siteCustomization');
    if (!raw) return;
    const data = JSON.parse(raw);

    if (data.siteTitle) {
      document.title = data.siteTitle;
    }

    if (data.faviconPath) {
      let link = document.querySelector("link[rel*='icon']");
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.href = data.faviconPath;
    }

    // apply login background var used in LoginPage inline styles
    if (data.loginBgType) {
      if (data.loginBgType === 'image' && data.loginBgImagePath) {
        document.documentElement.style.setProperty('--site-login-bg', `url('${data.loginBgImagePath}')`);
      } else if (data.loginBgType === 'color' && data.loginBgColor) {
        document.documentElement.style.setProperty('--site-login-bg', data.loginBgColor);
      } else if (data.loginBgType === 'gradient' && data.loginBgGradientFrom && data.loginBgGradientTo) {
        document.documentElement.style.setProperty('--site-login-bg', `linear-gradient(90deg, ${data.loginBgGradientFrom}, ${data.loginBgGradientTo})`);
      }
    }
  } catch (e) {
    // ignore
  }
};

applySavedCustomization();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
