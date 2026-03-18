/**
 * SMS Stats Page Manager - Persists SMS stats pages to disk before DB insert.
 *
 * IMPORTANT: Uses per-client and per-campaign isolation to avoid mixing stats
 * across different Mautic clients.
 */

import fs from 'fs';
import path from 'path';
import logger from '../../../../utils/logger.js';
import { getClientKey, getMauticTempRoot, migrateClientTempDirIfNeeded, writeClientMeta } from '../../utils/tempPages.js';

class SmsStatsPageManager {
  constructor() {
    this.baseTemp = getMauticTempRoot();
    this.ensureBaseDir();
  }

  ensureBaseDir() {
    try {
      if (!fs.existsSync(this.baseTemp)) {
        fs.mkdirSync(this.baseTemp, { recursive: true });
        logger.info(`📁 Created .temp_pages directory: ${this.baseTemp}`);
      }
    } catch (e) {
      logger.warn(`⚠️ Failed to ensure .temp_pages directory:`, e.message);
    }
  }

  toYearMonth(dateStr) {
    try {
      const d = dateStr ? new Date(dateStr) : null;
      if (d && !isNaN(d.getTime())) {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      }
    } catch {
      // ignore
    }
    return 'unknown';
  }

  getCampaignDir({ client, clientKey, yearMonth, mauticSmsId }) {
    // Ensure per-client dir exists (and migrate legacy numeric/id-name dir if present).
    migrateClientTempDirIfNeeded('mautic-sms-stats', client);
    writeClientMeta('mautic-sms-stats', client);

    const key = clientKey || getClientKey(client, 'mautic-sms-stats') || 'unknown-client';
    const month = yearMonth || 'unknown';

    return path.join(
      this.baseTemp,
      'mautic-sms-stats',
      key,
      month,
      `sms_${mauticSmsId || 'unknown'}`
    );
  }

  /**
   * Save a page (new signature).
   * @param {Object} options
   * @param {Object} options.client
   * @param {string} [options.clientKey]
   * @param {string} options.yearMonth
   * @param {number} options.mauticSmsId
   * @param {number} options.pageNumber
   * @param {Array} options.pageData
   */
  savePage(options) {
    try {
      const dir = this.getCampaignDir(options);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      const filename = `page_${options.pageNumber}.json`;
      const filepath = path.join(dir, filename);

      const payload = {
        pageNumber: options.pageNumber,
        totalRecords: Array.isArray(options.pageData) ? options.pageData.length : 0,
        savedAt: new Date().toISOString(),
        data: Array.isArray(options.pageData) ? options.pageData : []
      };

      fs.writeFileSync(filepath, JSON.stringify(payload, null, 2));
      return true;
    } catch (e) {
      logger.error(`❌ Failed to save SMS stats page:`, e.message);
      return false;
    }
  }

  findOrphanedPagesForCampaign({ client, clientKey, mauticSmsId }) {
    try {
      const key = clientKey || getClientKey(client, 'mautic-sms-stats') || 'unknown-client';
      const root = path.join(this.baseTemp, 'mautic-sms-stats', key);
      const out = [];

      if (!fs.existsSync(root)) return out;

      const monthDirs = fs.readdirSync(root);
      for (const month of monthDirs) {
        const monthPath = path.join(root, month);
        if (!fs.statSync(monthPath).isDirectory()) continue;

        const campaignDir = path.join(monthPath, `sms_${mauticSmsId}`);
        if (!fs.existsSync(campaignDir) || !fs.statSync(campaignDir).isDirectory()) continue;

        const files = fs.readdirSync(campaignDir);
        for (const file of files) {
          const match = file.match(/^page_(\d+)\.json$/i);
          if (!match) continue;
          out.push({
            yearMonth: month,
            pageNumber: parseInt(match[1], 10),
            filepath: path.join(campaignDir, file)
          });
        }
      }

      out.sort((a, b) => {
        if (a.yearMonth !== b.yearMonth) return a.yearMonth.localeCompare(b.yearMonth);
        return a.pageNumber - b.pageNumber;
      });

      return out;
    } catch (e) {
      logger.error(`❌ Error finding campaign orphaned pages:`, e.message);
      return [];
    }
  }

  recoverOrphanedPages(options = null) {
    try {
      const orphaned = options && options.mauticSmsId
        ? this.findOrphanedPagesForCampaign(options)
        : [];

      if (orphaned.length === 0) return [];

      const recovered = [];
      for (const page of orphaned) {
        try {
          const content = fs.readFileSync(page.filepath, 'utf-8');
          const payload = JSON.parse(content);
          recovered.push({
            pageNumber: page.pageNumber,
            yearMonth: page.yearMonth,
            data: payload.data,
            filepath: page.filepath
          });
        } catch (e) {
          logger.error(`❌ Failed to recover page ${page.pageNumber}:`, e.message);
        }
      }

      return recovered;
    } catch (e) {
      logger.error(`❌ Error recovering orphaned pages:`, e.message);
      return [];
    }
  }
}

export default new SmsStatsPageManager();
