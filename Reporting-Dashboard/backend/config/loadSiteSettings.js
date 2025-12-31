import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import prisma from '../prisma/client.js';
import logger from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Escape HTML special characters to prevent XSS
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Load site settings and inject into index.html
 * Handles dynamic branding (title, favicon, login background) before React loads
 * 
 * @param {string} indexPath - Path to index.html file
 * @returns {Promise<string>} Modified HTML string with injected site settings
 */
export async function loadSiteSettings(indexPath) {
  try {
    // Read the base HTML file
    let html = await fs.promises.readFile(indexPath, 'utf8');

    // Fetch latest site settings from database (best-effort)
    let site = null;
    try {
      site = await prisma.siteSettings.findFirst({ 
        orderBy: { updatedAt: 'desc' } 
      });
    } catch (err) {
      logger.warn('Failed to load siteSettings for index injection', { error: err?.message || err });
    }

    // If no site settings found, return unmodified HTML
    if (!site) {
      return html;
    }

    // ============================================
    // INJECT PAGE TITLE
    // ============================================
    const title = site.siteTitle ? escapeHtml(site.siteTitle) : 'Reporting Dashboard';
    html = html.replace(/<title>.*?<\/title>/i, `<title>${title}</title>`);

    // ============================================
    // INJECT FAVICON
    // ============================================
    const favicon = site.faviconPath || '/favicon.png';
    
    // Replace existing favicon link tag if present, otherwise inject before </head>
    if (/link[^>]+rel=["']?icon["']?/i.test(html)) {
      html = html.replace(
        /<link[^>]+rel=["']?icon["']?[^>]*>/i, 
        `<link rel="icon" type="image/png" href="${favicon}">`
      );
    } else {
      html = html.replace(
        '</head>', 
        `<link rel="icon" type="image/png" href="${favicon}">\n</head>`
      );
    }

    // ============================================
    // INJECT LOGIN BACKGROUND CSS
    // ============================================
    let loginBg = '';
    
    if (site.loginBgType === 'color' && site.loginBgColor) {
      loginBg = site.loginBgColor;
    } else if (site.loginBgType === 'gradient' && site.loginBgGradientFrom && site.loginBgGradientTo) {
      loginBg = `linear-gradient(90deg, ${site.loginBgGradientFrom}, ${site.loginBgGradientTo})`;
    } else if (site.loginBgType === 'image' && site.loginBgImagePath) {
      loginBg = `url('${site.loginBgImagePath}') center/cover no-repeat`;
    }
    
    if (loginBg) {
      html = html.replace(
        '</head>', 
        `<style>:root{--site-login-bg:${loginBg};}</style>\n</head>`
      );
    }

    return html;

  } catch (err) {
    logger.error('Error loading site settings', { error: err.message, stack: err.stack });
    throw err;
  }
}

/**
 * Create catch-all route handler for serving dynamic index.html
 * Injects site-specific branding from database into the HTML
 * 
 * @returns {Function} Express route handler
 */
export function createDynamicIndexHandler() {
  const indexPath = path.join(__dirname, '..', 'dist', 'index.html');
  const isDevelopment = process.env.NODE_ENV !== 'production';
  const distExists = fs.existsSync(indexPath);

  return async (req, res, next) => {
    // In development mode or when dist doesn't exist, skip and let Vite handle it
    if (isDevelopment && !distExists) {
      return next();
    }

    try {
      const html = await loadSiteSettings(indexPath);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(html);
    } catch (err) {
      logger.error('Error serving dynamic index.html, falling back to static file', { error: err.message, stack: err.stack });
      // In development, just skip if file not found
      if (isDevelopment) {
        return next();
      }
      return res.sendFile(indexPath);
    }
  };
}

export default createDynamicIndexHandler;
