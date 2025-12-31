import logger from '../../../utils/logger.js';
import axios from 'axios';
import encryptionService from './encryption.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import pLimit from 'p-limit';
import prisma from '../../../prisma/client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class MauticAPIService {
  /**
   * Normalize Mautic URL
   * @param {string} url - Mautic URL
   * @returns {string} Normalized URL
   */
  normalizeUrl(url) {
    let normalized = url.trim();
    if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
      normalized = 'https://' + normalized;
    }
    // Remove trailing slash
    normalized = normalized.replace(/\/$/, '');
    return normalized;
  }

  /**
   * Create authenticated Mautic API client
   * @param {Object} client - Client object with mauticUrl, username, password (encrypted)
   * @returns {Object} Axios instance configured for Mautic API
   */
  createClient(client) {
    const password = encryptionService.decrypt(client.password);
    const normalizedUrl = this.normalizeUrl(client.mauticUrl);

    const apiClient = axios.create({
      baseURL: `${normalizedUrl}/api`,
      auth: {
        username: client.username,
        password: password
      },
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 120000 // 2 minutes for large data fetches
    });

    return apiClient;
  }

  /**
   * Test connection to Autovation instance
   * @param {Object} credentials - { mauticUrl, username, password }
   * @returns {Promise<Object>} { success: boolean, message: string }
   */
  async testConnection(credentials) {
    try {
      // Ensure URL has protocol
      const mauticUrl = this.normalizeUrl(credentials.mauticUrl);

      const apiClient = axios.create({
        baseURL: `${mauticUrl}/api`,
        auth: {
          username: credentials.username,
          password: credentials.password
        },
        timeout: 30000 // 30 seconds for connection test
      });

      // Test with a simple API call
      const response = await apiClient.get('/contacts', {
        params: { limit: 1 }
      });

      return {
        success: true,
        message: 'Connection successful',
        data: response.data
      };
    } catch (error) {
      logger.error('Mautic connection test failed:', error.message);
      return {
        success: false,
        message: error.response?.data?.errors?.[0]?.message || error.message || 'Connection failed',
        error: error.message
      };
    }
  }

  /**
   * Fetch all email campaigns from Mautic
   * @param {Object} client - Client configuration
   * @returns {Promise<Array>} Array of email objects with stats
   */
  async fetchEmails(client) {
    try {
      const apiClient = this.createClient(client);
      const emails = [];
      let start = 0;
      const limit = 1000000; // increase page size to request more items per page
      let hasMore = true;

      logger.debug(` Fetching emails from ${client.name}...`);

      while (hasMore) {
        const response = await apiClient.get('/emails', {
          params: {
            start: start,
            limit: limit,
            orderBy: 'id',
            orderByDir: 'ASC'
          }
        });

        const data = response.data;

        if (data.emails) {
          const emailArray = Object.values(data.emails);

          // Push emails directly - stats are already included in the list response
          emails.push(...emailArray);

          logger.debug(`   Fetched ${emails.length} emails...`);

          // If API provides a total, use it to determine whether more pages exist.
          const total = parseInt(data.total || 0, 10);
          if (total && emails.length < total) {
            start += limit;
            hasMore = true;
          } else if (emailArray.length === limit) {
            // fallback: if returned exactly limit, request next page
            start += limit;
            hasMore = true;
          } else {
            hasMore = false;
          }
        } else {
          hasMore = false;
        }
      }

      logger.debug(`✅ Total emails fetched: ${emails.length}`);
      return emails;
    } catch (error) {
      logger.error('Error fetching emails:', error.message);
      throw new Error(`Failed to fetch emails: ${error.message}`);
    }
  }

  /**
   * Fetch all campaigns from Mautic
   * @param {Object} client - Client configuration
   * @returns {Promise<Array>} Array of campaign objects
   */
  async fetchCampaigns(client) {
    try {
      const apiClient = this.createClient(client);
      const campaigns = [];
      let start = 0;
      const limit = 100000; // increase page size
      let hasMore = true;

      logger.debug(`🎯 Fetching campaigns from ${client.name}...`);

      while (hasMore) {
        const response = await apiClient.get('/campaigns', {
          params: {
            start: start,
            limit: limit,
            orderBy: 'id',
            orderByDir: 'ASC'
          }
        });

        const data = response.data;

        if (data.campaigns) {
          const campaignArray = Object.values(data.campaigns);
          campaigns.push(...campaignArray);

          logger.debug(`   Fetched ${campaigns.length} campaigns...`);

          const total = parseInt(data.total || 0, 10);
          if (total && campaigns.length < total) {
            start += limit;
            hasMore = true;
          } else if (campaignArray.length === limit) {
            start += limit;
            hasMore = true;
          } else {
            hasMore = false;
          }
        } else {
          hasMore = false;
        }
      }

      logger.debug(`✅ Total campaigns fetched: ${campaigns.length}`);
      logger.debug(`   Campaign IDs: ${campaigns.map(c => c.id).join(', ')}`);
      return campaigns;
    } catch (error) {
      logger.error('Error fetching campaigns:', error.message);
      throw new Error(`Failed to fetch campaigns: ${error.message}`);
    }
  }

  /**
   * Fetch all segments (lists) from Mautic
   * @param {Object} client - Client configuration
   * @returns {Promise<Array>} Array of segment objects
   */
  async fetchSegments(client) {
    try {
      const apiClient = this.createClient(client);
      const segments = [];
      let start = 0;
      const limit = 1000000; // increase page size
      let hasMore = true;

      logger.debug(`📋 Fetching segments from ${client.name}...`);

      while (hasMore) {
        const response = await apiClient.get('/segments', {
          params: {
            start: start,
            limit: limit,
            orderBy: 'id',
            orderByDir: 'ASC'
          }
        });

        const data = response.data;

        if (data.lists) {
          const segmentArray = Object.values(data.lists);
          segments.push(...segmentArray);

          logger.debug(`   Fetched ${segments.length} segments...`);

          const total = parseInt(data.total || 0, 10);
          if (total && segments.length < total) {
            start += limit;
            hasMore = true;
          } else if (segmentArray.length === limit) {
            start += limit;
            hasMore = true;
          } else {
            hasMore = false;
          }
        } else {
          hasMore = false;
        }
      }

      logger.debug(`✅ Total segments fetched: ${segments.length}`);
      return segments;
    } catch (error) {
      logger.error('Error fetching segments:', error.message);
      throw new Error(`Failed to fetch segments: ${error.message}`);
    }
  }

  /**
 * Fetch a full Mautic report and save directly to database in streaming batches
 * This prevents memory overload and responds immediately to frontend
 * @param {Object} client - Client object containing mauticUrl, username, password, reportId
 * @returns {Object} Report fetch status with count
 */
  async fetchReport(client) {
    // Import dataService here to avoid circular dependencies
    const { default: dataService } = await import('./dataService.js');
    
    try {
      const apiClient = this.createClient(client);
      const reportId = client.reportId;

      if (!reportId) {
        throw new Error(`No reportId found for client: ${client.name}`);
      }

      let start = 0;
      const limit = 200000; // Mautic API max limit
      let hasMore = true;
      let totalRows = 0;
      let totalCreated = 0;
      let totalSkipped = 0;

      // Only fetch data from last sync onwards (incremental sync)
      const dateFrom = client.lastSyncAt 
        ? new Date(client.lastSyncAt).toISOString().split('T')[0]
        : null;

      logger.debug(`📊 Fetching & saving report ID ${reportId} for ${client.name}${dateFrom ? ` (since ${dateFrom})` : ' (full sync)'}...`);

      // Fetch and save in batches (streaming approach)
      while (hasMore) {
        const params = {
          start: start,
          limit: limit
        };

        // Add date filter for incremental sync
        if (dateFrom) {
          params.dateFrom = dateFrom;
        }

        const response = await apiClient.get(`/reports/${reportId}`, {
          params: params
        });

        const data = response.data;

        if (!data || !data.data) {
          logger.warn(`⚠️ No 'data' field found in report ${reportId} response.`);
          break;
        }

        const batchRows = data.data;
        const totalAvailable = parseInt(data.totalResults || data.total || 0, 10);
        
        logger.debug(`   Batch ${Math.floor(start / limit) + 1}: Fetched ${batchRows.length} rows (Total in Mautic: ${totalAvailable || 'unknown'}, Progress: ${totalRows + batchRows.length})...`);

        // Save batch immediately to database (don't accumulate in memory)
        if (batchRows.length > 0) {
          const saveResult = await dataService.saveEmailReports(client.id, batchRows);
          totalCreated += saveResult.created;
          totalSkipped += saveResult.skipped;
          totalRows += batchRows.length;

          logger.debug(`   Saved: ${saveResult.created} new, ${saveResult.skipped} duplicates (Total so far: ${totalCreated} created, ${totalSkipped} skipped)`);
        }

        // Determine if we should continue fetching
        // Stop if: no data returned OR we've reached the total available
        if (batchRows.length === 0) {
          logger.debug(`✅ Stopping: No more data returned by API`);
          hasMore = false;
        } else if (totalAvailable > 0 && totalRows >= totalAvailable) {
          logger.debug(`✅ Stopping: Reached Mautic's total (${totalRows}/${totalAvailable})`);
          hasMore = false;
        } else if (batchRows.length < limit && (!totalAvailable || totalRows >= totalAvailable)) {
          // Only stop on partial batch if we don't know total OR we've reached it
          logger.debug(`✅ Stopping: Partial batch received (${batchRows.length} < ${limit}) and ${totalAvailable ? 'total reached' : 'no total available'}`);
          hasMore = false;
        } else {
          // Continue to next batch
          logger.debug(`   ➡️  Continuing to next batch (fetched: ${totalRows}, available: ${totalAvailable || 'unknown'})...`);
          start += batchRows.length; // Use actual rows fetched, not limit
          hasMore = true;
        }
      }

      logger.debug(`✅ Report complete: ${totalRows} rows fetched, ${totalCreated} saved to DB, ${totalSkipped} skipped`);

      return {
        success: true,
        totalRows: totalRows,
        created: totalCreated,
        skipped: totalSkipped
      };

    } catch (error) {
      logger.error(`❌ Error fetching report for client ${client.name}:`, error.message);
      throw new Error(`Failed to fetch report for client ${client.name}: ${error.message}`);
    }
  }

  /**
   * Fetch historical reports for a specific date range (used for backfilling)
   * @param {Object} client - Client object
   * @param {string} fromDate - Start date (YYYY-MM-DD)
   * @param {string} toDate - End date (YYYY-MM-DD)
   * @param {number} limit - API limit per batch
   * @returns {Object} Fetch results
   */
  async fetchHistoricalReports(client, fromDate, toDate, limit = 200000) {
    const { default: dataService } = await import('./dataService.js');
    try {
      const apiClient = this.createClient(client);
      const reportId = client.reportId;

      if (!reportId) {
        throw new Error(`No reportId found for client: ${client.name}`);
      }

      // Bound the limit to a sensible default if caller passed something too large
      const PAGE_LIMIT = Math.max(1000, Math.min(parseInt(limit, 10) || 5000, 200000));
      const RETRIES = 6;
      const CONCURRENCY = parseInt(process.env.MAUTIC_FETCH_CONCURRENCY || '10', 10);

      const baseTemp = path.join(__dirname, '..', '..', '.temp_pages');
      if (!fs.existsSync(baseTemp)) {
        try { fs.mkdirSync(baseTemp, { recursive: true }); } catch (e) { }
      }

      const monthKey = (() => {
        // derive YYYY-MM for logging and temp file storage from fromDate
        try {
          const d = new Date(fromDate);
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, '0');
          return `${y}-${m}`;
        } catch (e) { return 'unknown-month'; }
      })();

      // Helper: parse date strings like 'YYYY-MM-DD HH:mm:ss' into UTC Date
      const parseToUTC = (s) => {
        if (!s) return null;
        // Match 'YYYY-MM-DD' or 'YYYY-MM-DD HH:MM:SS' or ISO
        const m = String(s).trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2}))?/);
        if (m) {
          const year = Number(m[1]);
          const month = Number(m[2]);
          const day = Number(m[3]);
          const hour = Number(m[4] || '0');
          const minute = Number(m[5] || '0');
          const second = Number(m[6] || '0');
          return new Date(Date.UTC(year, month - 1, day, hour, minute, second));
        }
        const d = new Date(s);
        return isNaN(d.getTime()) ? null : d;
      };

      const savePage = (page, payload) => {
        try {
          const dir = path.join(baseTemp, monthKey);
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(path.join(dir, `page_${page}.json`), JSON.stringify(payload, null, 2));
        } catch (e) {
          logger.warn('Failed to write temp page file:', e.message);
        }
      };

      const sleep = (ms) => new Promise(r => setTimeout(r, ms));

      async function fetchPage(page, attempt = 0) {
        try {
          const res = await apiClient.get(`/reports/${reportId}`, {
            params: { page, limit: PAGE_LIMIT, dateFrom: fromDate, dateTo: toDate }
          });
          return res.data;
        } catch (err) {
          if (attempt >= RETRIES) throw err;
          const delay = (attempt + 1) * 2000;
          logger.warn(`Retry page ${page} in ${delay / 1000}s`);
          await sleep(delay);
          return fetchPage(page, attempt + 1);
        }
      }

      logger.debug(`📅 Fetching historical reports (page-mode) ${fromDate} → ${toDate} for ${client.name} (pageLimit=${PAGE_LIMIT}, concurrency=${CONCURRENCY})`);

      // fetch first page to know totals
      const first = await fetchPage(1);
      if (!first || !Array.isArray(first.data)) {
        logger.warn('⚠️ First page returned no data, aborting historical month fetch');
        return { success: true, created: 0, skipped: 0, totalRows: 0, dateRange: { from: fromDate, to: toDate } };
      }

      const total = parseInt(first.totalResults || first.total || first.data.length || 0, 10) || first.data.length;
      const totalPages = Math.max(1, Math.ceil(total / PAGE_LIMIT));

      logger.debug(`   Month ${monthKey}: total records in Mautic: ${total} → pages: ${totalPages}`);

      // save first page and persist immediately
      savePage(1, first);
      let totalCreated = 0;
      let totalSkipped = 0;
      if (first.data.length > 0) {
        const res = await dataService.saveEmailReports(client.id, first.data);
        totalCreated += res.created;
        totalSkipped += res.skipped;
      }

      if (totalPages > 1) {
        const limiter = pLimit(CONCURRENCY);
        const tasks = [];
        for (let p = 2; p <= totalPages; p++) {
          tasks.push(limiter(async () => {
            const payload = await fetchPage(p);
            if (!payload || !Array.isArray(payload.data)) return { created: 0, skipped: 0 };
            savePage(p, payload);
            try {
              const r = await dataService.saveEmailReports(client.id, payload.data);
              return r;
            } catch (e) {
              logger.error(`Error saving page ${p} for ${monthKey}:`, e.message);
              // try once per-row fallback inside dataService.saveEmailReports already handles failures
              return { created: 0, skipped: 0 };
            }
          }));
        }

        const results = await Promise.all(tasks);
        for (const r of results) {
          if (r) {
            totalCreated += r.created || 0;
            totalSkipped += r.skipped || 0;
          }
        }
      }

      // mark month as fetched to skip future re-fetches (atomic & safe for concurrency)
      try {
        // Attempt to insert; skipDuplicates prevents unique-constraint errors
        // parse to UTC to avoid timezone offsets when storing in DB
        const parsedFrom = parseToUTC(fromDate) || new Date(fromDate);
        const parsedTo = parseToUTC(toDate) || new Date(toDate);

        await prisma.mauticFetchedMonth.createMany({
          data: [{
            clientId: client.id,
            yearMonth: monthKey,
            from: parsedFrom,
            to: parsedTo
          }],
          skipDuplicates: true
        });

        // Ensure from/to are up-to-date (updateMany is safe even if no row exists)
        try {
          await prisma.mauticFetchedMonth.updateMany({
            where: { clientId: client.id, yearMonth: monthKey },
            data: { from: parsedFrom, to: parsedTo }
          });
        } catch (uErr) {
          // updateMany shouldn't typically fail; log for diagnostics
          logger.warn('Failed to update fetched-month from/to (non-fatal):', uErr.message || uErr);
        }
      } catch (e) {
        // Non-fatal: we don't want the entire backfill to fail because of marker writes
        logger.warn('Failed to mark fetched month (non-fatal):', e.message || e);
      }

      logger.debug(`✅ Historical month ${monthKey} complete: ${totalCreated} created, ${totalSkipped} skipped`);

      return {
        success: true,
        totalRows: total,
        created: totalCreated,
        skipped: totalSkipped,
        dateRange: { from: fromDate, to: toDate }
      };
    } catch (error) {
      logger.error(`❌ Error fetching historical reports:`, error.message);
      throw new Error(`Failed to fetch historical reports: ${error.message}`);
    }
  }

  /**
   * Sync all data for a client (emails, campaigns, segments, reports)
   * Email reports are saved to database during fetch (streaming)
   * @param {Object} client - Client configuration
   * @returns {Promise<Object>} Sync results
   */
  async syncAllData(client) {
    try {
      logger.debug(`🔄 Starting full sync for ${client.name}...`);

      // Fetch emails, campaigns, and segments in parallel (fast metadata)
      const [emails, campaigns, segments] = await Promise.all([
        this.fetchEmails(client),
        this.fetchCampaigns(client),
        this.fetchSegments(client)
      ]);

      // Fetch report data AFTER metadata succeeds (prevents background execution on error)
      // This is a long-running operation that saves directly to DB
      const emailReportResult = await this.fetchReport(client);

      return {
        success: true,
        data: {
          emails,
          campaigns,
          segments,
          emailReports: {
            totalRows: emailReportResult.totalRows,
            created: emailReportResult.created,
            skipped: emailReportResult.skipped
          }
        }
      };
    } catch (error) {
      logger.error('Error syncing data:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

export default new MauticAPIService();
