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
    let password;
    try {
      password = encryptionService.decrypt(client.password);
    } catch (err) {
      // Re-throw with contextual info for easier debugging
      throw new Error(`Failed to decrypt password for Mautic client '${client.name || client.id}': ${err.message}`);
    }
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
      timeout: 300000 // ⚡ 5 minutes for MASSIVE data fetches
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
      console.error('Mautic connection test failed:', error.message);
      return {
        success: false,
        message: error.response?.data?.errors?.[0]?.message || error.message || 'Connection failed',
        error: error.message
      };
    }
  }

  /**
   * Retry helper with exponential backoff - ULTRA ROBUST!
   */
  async retryWithBackoff(fn, maxRetries = 5, initialDelay = 500) { // ⚡ More retries, faster initial delay
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn();
      } catch (error) {
        const isRetryable =
          error.code === 'ETIMEDOUT' ||
          error.code === 'ECONNRESET' ||
          error.code === 'ECONNREFUSED' || // ⚡ Added
          error.code === 'EPIPE' || // ⚡ Added
          error.message.includes('socket hang up') ||
          error.message.includes('ECONNRESET') ||
          error.response?.status === 429 || // Rate limit
          error.response?.status === 502 || // Bad gateway
          error.response?.status === 503 || // Service unavailable
          error.response?.status === 504;   // ⚡ Gateway timeout

        if (!isRetryable || i === maxRetries - 1) {
          throw error;
        }

        const delay = Math.min(initialDelay * Math.pow(2, i), 30000); // ⚡ Cap at 30s
        console.log(`   ⚠️  Retry ${i + 1}/${maxRetries} in ${delay / 1000}s (${error.message})...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * Fetch individual email statistics (clicks, bounces, unsubscribes)
   * @param {Object} client - Client configuration
   * @param {number} emailId - Mautic email ID
   * @returns {Promise<Object>} Email statistics
   */
  async fetchEmailStats(client, emailId) {
    try {
      const apiClient = this.createClient(client);
      const limit = 200000;

      // Fetch with retry logic
      const [emailStatsResp, pageHitsResp] = await this.retryWithBackoff(async () => {
        return Promise.all([
          apiClient.get('/stats/email_stats', {
            params: {
              start: 0,
              limit: limit,
              'where[0][col]': 'email_id',
              'where[0][expr]': 'eq',
              'where[0][val]': emailId
            }
          }),
          apiClient.get('/stats/page_hits', {
            params: {
              start: 0,
              limit: limit,
              'where[0][col]': 'email_id',
              'where[0][expr]': 'eq',
              'where[0][val]': emailId
            }
          })
        ]);
      });

      const emailStats = emailStatsResp.data.stats || [];
      const clickStats = pageHitsResp.data.stats || [];

      const totalSent = emailStats.length;
      const totalOpened = emailStats.filter(s => s.is_read === 1 || s.is_read === true).length;
      const totalBounced = emailStats.filter(s => s.is_failed === 1 || s.is_failed === true).length;
      const totalUnsubscribed = emailStats.filter(s => s.is_unsubscribed === 1 || s.is_unsubscribed === true).length;
      const totalClicks = clickStats.length;

      return {
        EmailID: emailId,
        TotalSent: totalSent,
        TotalOpened: totalOpened,
        TotalBounced: totalBounced,
        TotalUnsubscribed: totalUnsubscribed,
        TotalClicks: totalClicks,
        OpenRate: totalSent > 0 ? ((totalOpened / totalSent) * 100).toFixed(2) : '0.00',
        ClickRate: totalSent > 0 ? ((totalClicks / totalSent) * 100).toFixed(2) : '0.00',
        BounceRate: totalSent > 0 ? ((totalBounced / totalSent) * 100).toFixed(2) : '0.00'
      };
    } catch (error) {
      // Silently skip failed emails - they'll be retried on next sync
      return null;
    }
  }

  /**
   * Fetch all email campaigns from Mautic with enhanced stats
   * @param {Object} client - Client configuration
   * @param {boolean} fetchStats - Whether to fetch individual email stats (default: true)
   * @returns {Promise<Array>} Array of email objects with stats
   */
  async fetchEmails(client, fetchStats = true) {
    try {
      const apiClient = this.createClient(client);
      let emails = [];
      let start = 0;
      const limit = 5000; // ⚡ MASSIVE page size to reduce API calls
      let hasMore = true;

      console.log(` Fetching emails from ${client.name}...`);

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

          console.log(`   Fetched ${emails.length} emails...`);

          // If API provides a total, use it to determine whether more pages exist.
          const rawTotalEmails = data.total || 0;
          const total = typeof rawTotalEmails === 'number'
            ? rawTotalEmails
            : parseInt(String(rawTotalEmails).replace(/[^0-9]/g, ''), 10) || 0;
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

      console.log(`✅ Total emails fetched: ${emails.length}`);

      // ⚡ SPEED OPTIMIZATION: Skip individual stats fetching entirely!
      // Email stats come from the /emails API response (sentCount, readCount, etc.)
      // For detailed per-contact data, use report data instead
      // This saves 200+ seconds on large email lists!
      console.log(`⚡ SPEED MODE: Skipping individual stats fetch (using email list data)`);

      return emails;
    } catch (error) {
      console.error('Error fetching emails:', error.message);
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
      const limit = 5000; // ⚡ MASSIVE page size
      let hasMore = true;

      console.log(`🎯 Fetching campaigns from ${client.name}...`);

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

          console.log(`   Fetched ${campaigns.length} campaigns...`);

          const rawTotalCampaigns = data.total || 0;
          const total = typeof rawTotalCampaigns === 'number'
            ? rawTotalCampaigns
            : parseInt(String(rawTotalCampaigns).replace(/[^0-9]/g, ''), 10) || 0;
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

      console.log(`✅ Total campaigns fetched: ${campaigns.length}`);
      console.log(`   Campaign IDs: ${campaigns.map(c => c.id).join(', ')}`);
      return campaigns;
    } catch (error) {
      console.error('Error fetching campaigns:', error.message);
      throw new Error(`Failed to fetch campaigns: ${error.message}`);
    }
  }

  /**
   * Fetch click trackable records for all emails in batch and save to DB
   * @param {Object} client - Client configuration
   * @param {Array} emails - Array of email objects (must contain .id)
   */
  async fetchAllEmailClickStats(client, emails) {
    // Import dataService here to avoid circular deps
    const { default: dataService } = await import('./dataService.js');
    try {
      if (!emails || emails.length === 0) return { success: true, created: 0 };

      console.log(`📊 Fetching click trackables for ${emails.length} emails from ${client.name}...`);

      const apiClient = this.createClient(client);
      const clickRows = [];
      const batchSize = 10;

      for (let i = 0; i < emails.length; i += batchSize) {
        const batch = emails.slice(i, i + batchSize);
        const results = await Promise.allSettled(batch.map(async (email) => {
          try {
            const emailId = email.id || email.mauticEmailId || email.e_id;
            if (!emailId) return [];
            const resp = await apiClient.get('/stats/channel_url_trackables', {
              params: {
                'where[0][col]': 'channel_id',
                'where[0][expr]': 'eq',
                'where[0][val]': emailId,
                limit: 10000
              }
            });
            const rows = resp.data?.stats || resp.data || [];
            return rows.map(r => ({
              redirect_id: r.redirect_id || r.id || r.redirectId || '',
              hits: parseInt(r.hits || r.hits_count || 0, 10) || 0,
              unique_hits: parseInt(r.unique_hits || r.unique_hits_count || r.uniqueHits || 0, 10) || 0,
              channel_id: parseInt(emailId, 10) || 0,
              url: r.url || r.path || null
            }));
          } catch (e) {
            console.warn(`   Failed to fetch click stats for email ${email.id}:`, e.message || e);
            return [];
          }
        }));

        for (const r of results) {
          if (r.status === 'fulfilled' && Array.isArray(r.value)) clickRows.push(...r.value);
        }

        console.log(`   Processed ${Math.min(i + batchSize, emails.length)}/${emails.length} emails (${clickRows.length} click records)...`);
      }

      // Deduplicate rows by redirect_id
      const dedupMap = new Map();
      for (const row of clickRows) {
        const key = String(row.redirect_id || `${row.channel_id}-${row.url}`);
        if (!dedupMap.has(key)) dedupMap.set(key, row);
        else {
          const existing = dedupMap.get(key);
          existing.hits = Math.max(existing.hits, row.hits || 0);
          existing.unique_hits = Math.max(existing.unique_hits, row.unique_hits || 0);
        }
      }
      const deduped = Array.from(dedupMap.values());

      const saveResult = await dataService.saveClickTrackables(client.id, deduped);
      console.log(`✅ Click trackables saved: ${saveResult.created} records`);
      return saveResult;
    } catch (error) {
      console.error('Error fetching click trackables:', error.message || error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Fetch all segments (lists) from Mautic with contact counts
   * @param {Object} client - Client configuration
   * @returns {Promise<Array>} Array of segment objects with leadCount
   */
  async fetchSegments(client) {
    try {
      const apiClient = this.createClient(client);
      const segments = [];
      let start = 0;
      const limit = 5000; // ⚡ MASSIVE page size
      let hasMore = true;

      console.log(`📋 Fetching segments from ${client.name}...`);

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

          console.log(`   Fetched ${segments.length} segments...`);

          const rawTotalSegments = data.total || 0;
          const total = typeof rawTotalSegments === 'number'
            ? rawTotalSegments
            : parseInt(String(rawTotalSegments).replace(/[^0-9]/g, ''), 10) || 0;
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

      console.log(`✅ Total segments fetched: ${segments.length}`);

      // ⚡ COUNT CONTACTS FOR EACH SEGMENT
      console.log(`\n🔍 Counting contacts for each segment...`);

      // ⚡ HIGH concurrency for ultra-fast contact counting
      const CONCURRENCY = Math.max(1, parseInt(process.env.MAUTIC_FETCH_CONCURRENCY || '20', 10)); // ⚡ 4x faster!
      const pLimiter = pLimit(CONCURRENCY);

      const tasks = segments.map(segment => pLimiter(async () => {
        try {
          // Query contacts API filtered by segment to get count
          const contactResponse = await apiClient.get('/contacts', {
            params: {
              search: `segment:${segment.alias}`,
              limit: 1, // We only need the count, not the data
              start: 0
            }
          });

          // Normalize total value returned by Mautic (might be a string with commas)
          const rawTotal = contactResponse.data?.total || 0;
          const count = typeof rawTotal === 'number'
            ? rawTotal
            : parseInt(String(rawTotal).replace(/[^0-9]/g, ''), 10) || 0;
          segment.leadCount = count;

          if (count > 0) {
            console.log(`   ✅ ${segment.name}: ${count} contacts`);
          } else {
            console.log(`   ⚪ ${segment.name}: 0 contacts`);
          }
        } catch (error) {
          console.error(`   ⚠️  Failed to count for segment ${segment.id} (${segment.name}): ${error.message}`);
          segment.leadCount = 0;
        }
        return segment;
      }));

      const segmentsWithCounts = await Promise.all(tasks);

      const totalContacts = segmentsWithCounts.reduce((sum, seg) => sum + (seg.leadCount || 0), 0);
      console.log(`\n✅ Contact count complete! Total across all segments: ${totalContacts}`);

      return segmentsWithCounts;
    } catch (error) {
      console.error('Error fetching segments:', error.message);
      throw new Error(`Failed to fetch segments: ${error.message}`);
    }
  }

  /**
 * Fetch a full Mautic report and save directly to database in streaming batches
 * This prevents memory overload and responds immediately to frontend
 * ⚡ OPTIMIZED: Only fetches NEW data since last sync (month-based tracking)
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
      const limit = 500000; // ⚡ ULTRA MASSIVE batch size for speed
      let hasMore = true;
      let totalRows = 0;
      let totalCreated = 0;
      let totalSkipped = 0;

      // ⚡⚡⚡ INTELLIGENT INCREMENTAL SYNC - Only fetch NEW data!
      // Check what we already have to avoid re-fetching
      const lastFetchedReport = await prisma.mauticEmailReport.findFirst({
        where: { clientId: client.id },
        orderBy: { dateSent: 'desc' },
        select: { dateSent: true }
      });

      // ⚡ CRITICAL OPTIMIZATION: If we just fetched recently, skip entirely!
      if (lastFetchedReport?.dateSent) {
        const hoursSinceLastFetch = (Date.now() - new Date(lastFetchedReport.dateSent).getTime()) / (1000 * 60 * 60);
        if (hoursSinceLastFetch < 1) {
          console.log(`⚡ SUPER FAST: Data fetched within last hour, skipping report fetch!`);
          return {
            success: true,
            totalRows: 0,
            created: 0,
            skipped: 0,
            message: 'No new data (fetched within last hour)'
          };
        }
      }

      const dateFrom = lastFetchedReport?.dateSent
        ? new Date(lastFetchedReport.dateSent).toISOString().split('T')[0]
        : null;

      console.log(`📊 Fetching & saving report ID ${reportId} for ${client.name}${dateFrom ? ` (since ${dateFrom} - INCREMENTAL!)` : ' (full sync)'}...`);

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

        // ⚡ Use retry logic for resilience against 429/502/503/504 errors
        const response = await this.retryWithBackoff(async () => {
          return await apiClient.get(`/reports/${reportId}`, { params });
        });

        const data = response.data;

        if (!data || !data.data) {
          console.warn(`⚠️ No 'data' field found in report ${reportId} response.`);
          break;
        }

        const batchRows = data.data;
        const rawTotalAvailable = data.totalResults || data.total || 0;
        const totalAvailable = typeof rawTotalAvailable === 'number'
          ? rawTotalAvailable
          : parseInt(String(rawTotalAvailable).replace(/[^0-9]/g, ''), 10) || 0;

        console.log(`   Batch ${Math.floor(start / limit) + 1}: Fetched ${batchRows.length} rows (Total in Mautic: ${totalAvailable || 'unknown'}, Progress: ${totalRows + batchRows.length})...`);

        // ⚡ ULTRA FAST EXIT: If no data at all, exit immediately
        if (batchRows.length === 0 && totalRows === 0 && totalAvailable === 0) {
          console.log(`⚡ INSTANT EXIT: No data available (already up to date!)`);
          hasMore = false;
          break;
        }

        // Save batch immediately to database (don't accumulate in memory)
        if (batchRows.length > 0) {
          const saveResult = await dataService.saveEmailReports(client.id, batchRows);
          totalCreated += saveResult.created;
          totalSkipped += saveResult.skipped;
          totalRows += batchRows.length;

          console.log(`   Saved: ${saveResult.created} new, ${saveResult.skipped} duplicates (Total so far: ${totalCreated} created, ${totalSkipped} skipped)`);
        }

        // Determine if we should continue fetching
        // Stop if: no data returned OR we've reached the total available
        if (batchRows.length === 0) {
          console.log(`✅ Stopping: No more data returned by API`);
          hasMore = false;
        } else if (totalAvailable > 0 && totalRows >= totalAvailable) {
          console.log(`✅ Stopping: Reached Mautic's total (${totalRows}/${totalAvailable})`);
          hasMore = false;
        } else if (batchRows.length < limit && (!totalAvailable || totalRows >= totalAvailable)) {
          // Only stop on partial batch if we don't know total OR we've reached it
          console.log(`✅ Stopping: Partial batch received (${batchRows.length} < ${limit}) and ${totalAvailable ? 'total reached' : 'no total available'}`);
          hasMore = false;
        } else {
          // Continue to next batch
          console.log(`   ➡️  Continuing to next batch (fetched: ${totalRows}, available: ${totalAvailable || 'unknown'})...`);
          start += batchRows.length; // Use actual rows fetched, not limit
          hasMore = true;
        }
      }

      console.log(`✅ Report complete: ${totalRows} rows fetched, ${totalCreated} saved to DB, ${totalSkipped} skipped`);

      return {
        success: true,
        totalRows: totalRows,
        created: totalCreated,
        skipped: totalSkipped
      };

    } catch (error) {
      console.error(`❌ Error fetching report for client ${client.name}:`, error.message);
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
          console.warn('Failed to write temp page file:', e.message);
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
          console.warn(`Retry page ${page} in ${delay / 1000}s`);
          await sleep(delay);
          return fetchPage(page, attempt + 1);
        }
      }

      console.log(`📅 Fetching historical reports (page-mode) ${fromDate} → ${toDate} for ${client.name} (pageLimit=${PAGE_LIMIT}, concurrency=${CONCURRENCY})`);

      // fetch first page to know totals
      const first = await fetchPage(1);
      if (!first || !Array.isArray(first.data)) {
        console.warn('⚠️ First page returned no data, aborting historical month fetch');
        return { success: true, created: 0, skipped: 0, totalRows: 0, dateRange: { from: fromDate, to: toDate } };
      }

      const total = parseInt(first.totalResults || first.total || first.data.length || 0, 10) || first.data.length;
      const totalPages = Math.max(1, Math.ceil(total / PAGE_LIMIT));

      console.log(`   Month ${monthKey}: total records in Mautic: ${total} → pages: ${totalPages}`);

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
              console.error(`Error saving page ${p} for ${monthKey}:`, e.message);
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
          console.warn('Failed to update fetched-month from/to (non-fatal):', uErr.message || uErr);
        }
      } catch (e) {
        // Non-fatal: we don't want the entire backfill to fail because of marker writes
        console.warn('Failed to mark fetched month (non-fatal):', e.message || e);
      }

      console.log(`✅ Historical month ${monthKey} complete: ${totalCreated} created, ${totalSkipped} skipped`);

      return {
        success: true,
        totalRows: total,
        created: totalCreated,
        skipped: totalSkipped,
        dateRange: { from: fromDate, to: toDate }
      };
    } catch (error) {
      console.error(`❌ Error fetching historical reports:`, error.message);
      throw new Error(`Failed to fetch historical reports: ${error.message}`);
    }
  }

  /**
   * Fetch all SMS campaigns from Mautic
   * @param {Object} client - Client configuration
   * @returns {Promise<Array>} Array of SMS campaign objects
   */
  async fetchSmses(client) {
    try {
      const apiClient = this.createClient(client);
      const smses = [];
      let start = 0;
      const limit = 5000;
      let hasMore = true;

      console.log(`📱 Fetching SMS campaigns from ${client.name}...`);

      while (hasMore) {
        const response = await apiClient.get('/smses', {
          params: {
            start: start,
            limit: limit,
            orderBy: 'name',
            orderByDir: 'ASC'
          }
        });

        const data = response.data;

        if (data.smses) {
          const smsArray = Object.values(data.smses);
          smses.push(...smsArray);
          start += smsArray.length;

          if (smsArray.length < limit) {
            hasMore = false;
          }
        } else {
          hasMore = false;
        }
      }

      console.log(`✅ Fetched ${smses.length} SMS campaigns`);
      return smses;
    } catch (error) {
      console.error(`Error fetching SMS campaigns: ${error.message}`);
      throw error;
    }
  }

  /**
   * Fetch SMS delivery statistics for a specific campaign
   * @param {Object} client - Client configuration
   * @param {number} smsId - Mautic SMS campaign ID
   * @param {number} limit - Records per request
   * @returns {Promise<Object>} SMS stats with pagination
   */
  async fetchSmsStats(client, smsId, limit = 500) {
    try {
      const apiClient = this.createClient(client);
      const stats = [];
      let start = 0;
      let total = limit; // Start with limit, will be updated from API response

      console.log(`📊 Fetching SMS stats for campaign ${smsId} using /api/stats/sms_message_stats...`);

      // Fetch SMS stats using the correct endpoint pattern from Mautic
      while (start < total) {
        const params = {
          'where[0][col]': 'sms_id',
          'where[0][expr]': 'eq',
          'where[0][val]': smsId,
          limit: limit,
          start: start
        };

        try {
          const response = await apiClient.get('/stats/sms_message_stats', { params });
          const data = response.data;

          // Mautic stats endpoint returns stats array directly
          if (data.stats && Array.isArray(data.stats)) {
            stats.push(...data.stats);
            total = data.total || stats.length;
            start += data.stats.length;

            console.log(`  - Fetched ${data.stats.length} records (total so far: ${stats.length}/${total})`);

            // If we got fewer records than limit, we've reached the end
            if (data.stats.length < limit) {
              break;
            }
          } else {
            console.warn(`⚠️  Unexpected response structure for SMS stats`);
            break;
          }
        } catch (err) {
          console.error(`Error fetching SMS stats batch starting at ${start}: ${err.message}`);
          // Non-fatal error - return what we've fetched so far
          break;
        }
      }

      console.log(`✅ Fetched ${stats.length} total SMS stats for campaign ${smsId}`);

      return {
        success: true,
        smsId,
        stats,
        totalFetched: stats.length
      };
    } catch (error) {
      console.error(`Error fetching SMS stats for campaign ${smsId}: ${error.message}`);
      // Return empty stats instead of throwing (non-fatal)
      return {
        success: true,
        smsId,
        stats: [],
        totalFetched: 0
      };
    }
  }

  /**
   * Fetch and store SMS stats for all campaigns
   * This must run BEFORE fetchAndStoreSmsMessages to populate the MauticSmsStat table
   * @param {Object} client - Client configuration
   * @returns {Promise<Object>} SMS stats sync results
   */
  async fetchAndStoreSmsStats(client) {
    const { default: smsService } = await import('./smsService.js');

    try {
      console.log(`📊 Fetching SMS stats for all campaigns for ${client.name}...`);

      // Get all SMS campaigns for this client from database
      const smsCampaigns = await prisma.mauticSms.findMany({
        where: { clientId: client.id },
        select: { id: true, mauticId: true, name: true }
      });

      if (smsCampaigns.length === 0) {
        console.log(`   No SMS campaigns found for ${client.name}`);
        return {
          success: true,
          totalStats: 0,
          campaignsProcessed: 0
        };
      }

      console.log(`   Found ${smsCampaigns.length} SMS campaigns to sync stats for`);

      const apiClient = this.createClient(client);
      let totalStats = 0;
      let campaignsProcessed = 0;

      // Fetch and store stats for each campaign
      for (const campaign of smsCampaigns) {
        try {
          console.log(`   📞 Fetching stats for SMS campaign: ${campaign.name} (ID: ${campaign.mauticId})`);

          // Fetch stats from Mautic API
          const statsResult = await this.fetchSmsStats(client, campaign.mauticId, 500);

          if (statsResult.success && statsResult.stats.length > 0) {
            // Store stats in database
            const storeResult = await smsService.storeSmsStats(client.id, campaign.id, statsResult.stats);
            totalStats += storeResult.created;
            console.log(`   💾 Stored ${storeResult.created} SMS stats for ${campaign.name}`);
          } else {
            console.log(`   ⚠️  No SMS stats found for ${campaign.name}`);
          }

          campaignsProcessed++;
        } catch (err) {
          console.warn(`   ⚠️  Failed to fetch/store stats for campaign ${campaign.name}: ${err.message}`);
        }
      }

      console.log(`✅ SMS stats sync complete: ${totalStats} stats stored for ${campaignsProcessed} campaigns`);

      return {
        success: true,
        totalStats,
        campaignsProcessed
      };
    } catch (error) {
      console.error(`Error fetching SMS stats for client ${client.name}:`, error.message);
      return {
        success: false,
        error: error.message,
        totalStats: 0,
        campaignsProcessed: 0
      };
    }
  }

  /**
   * Sync all data for a client (emails, campaigns, segments, reports)
   * Email reports are saved to database during fetch (streaming)
   * ⚡ ULTRA OPTIMIZED: Skips metadata on incremental sync for 1000x speed!
   * @param {Object} client - Client configuration
   * @returns {Promise<Object>} Sync results
   */
  async syncAllData(client) {
    try {
      console.log(`🔄 Starting sync for ${client.name}...`);

      // ⚡⚡⚡ SPEED BOOST: Check if we have any data already
      const hasExistingData = await prisma.mauticEmail.count({
        where: { clientId: client.id }
      }) > 0;

      let emails = [];
      let campaigns = [];
      let segments = [];
      let smses = [];

      // Always fetch email metadata to keep sentCount and readCount up-to-date
      // The /api/emails endpoint is fast and doesn't require individual /api/stats calls
      // Only campaigns and segments are skipped on incremental sync (rarely change)
      if (!hasExistingData) {
        // Full initial sync: fetch all metadata
        console.log(`🚀 INITIAL SYNC - Fetching metadata (emails/campaigns/segments)...`);
        const results = await Promise.all([
          this.fetchEmails(client, false), // ⚡ FALSE = NO individual stats fetch!
          this.fetchCampaigns(client),
          this.fetchSegments(client),
          this.fetchSmses(client).catch(err => {
            console.warn('SMS fetch failed (non-fatal):', err.message);
            return [];
          })
        ]);
        emails = results[0] || [];
        campaigns = results[1] || [];
        segments = results[2] || [];
        smses = results[3] || [];
      } else {
        console.log(`⚡⚡⚡ INCREMENTAL SYNC for ${client.name} — SKIPPING metadata fetch for MAXIMUM SPEED! ⚡⚡⚡`);

        // --- Fetch SMS Campaigns (Deepak branch) ---
        let smses = [];
        try {
          smses = await this.fetchSmses(client);
          console.log(`   ⚡ Fetched ${smses.length} SMS campaigns`);
        } catch (err) {
          console.warn('   ⚠️ SMS fetch failed in incremental sync (non-fatal):', err.message);
          smses = [];
        }

        // --- Fetch Emails (Main branch) ---
        let emails = [];
        try {
          console.log(`   🔄 Fetching emails to update stats...`);
          emails = await this.fetchEmails(client, false);
          console.log(`   ⚡ Fetched ${emails.length} emails for stats update`);
        } catch (err) {
          console.warn('   ⚠️ Email fetch failed in incremental sync (non-fatal):', err.message);
          emails = [];
        }

        // --- Persist Emails to DB ---
        try {
          const { default: dataService } = await import('./dataService.js');
          const saveRes = await dataService.saveEmails(client.id, emails);
          console.log(`   ✅ Saved emails to DB: created=${saveRes.created} updated=${saveRes.updated}`);
        } catch (saveErr) {
          console.warn('   ⚠️ Failed to save fetched emails to DB (non-fatal):', saveErr.message || saveErr);
        }
      }

      // Retrieve unique contact count from Mautic (avoid summing segment counts which may double-count)
      try {
        const apiClient = this.createClient(client);
        const contactResp = await apiClient.get('/contacts', { params: { start: 0, limit: 1, search: '!is:anonymous' } });
        const rawTotal = contactResp.data?.total || 0;
        const uniqueContacts = typeof rawTotal === 'number' ? rawTotal : parseInt(String(rawTotal).replace(/[^0-9]/g, ''), 10) || 0;

        // Update client totals in DB for quick metrics access
        try {
          const updateData = { totalContacts: uniqueContacts };
          // Only overwrite metadata totals if we fetched them in this run
          if (emails && emails.length > 0) updateData.totalEmails = emails.length;
          if (campaigns && campaigns.length > 0) updateData.totalCampaigns = campaigns.length;
          if (segments && segments.length > 0) updateData.totalSegments = segments.length;

          await prisma.mauticClient.update({ where: { id: client.id }, data: updateData });
          console.log(`   ✅ Updated client totals for ${client.name}: contacts=${uniqueContacts}, emails=${emails.length}, campaigns=${campaigns.length}, segments=${segments.length}`);
        } catch (uErr) {
          console.warn('Failed to update mauticClient totals (non-fatal):', uErr.message || uErr);
        }
      } catch (countErr) {
        console.warn('Failed to fetch unique contacts count from Mautic (non-fatal):', countErr.message || countErr);
      }

      // Fetch report data AFTER metadata succeeds (prevents background execution on error)
      // This is a long-running operation that saves directly to DB
      const emailReportResult = await this.fetchReport(client);

      // Store SMS campaigns in database if we fetched any
      console.log(`💾 Storing SMS campaigns for ${client.name}...`);
      const { default: smsService } = await import('./smsService.js');
      let smsStoreResult = { created: 0, updated: 0, total: 0 };
      if (smses && smses.length > 0) {
        try {
          smsStoreResult = await smsService.storeSmsCampaigns(client.id, smses);
          console.log(`✅ Stored ${smsStoreResult.created} new SMS campaigns, updated ${smsStoreResult.updated}`);
        } catch (err) {
          console.warn('Failed to store SMS campaigns (non-fatal):', err.message);
        }
      } else {
        console.log(`   No SMS campaigns to store`);
      }

      // Fetch and store SMS stats BEFORE fetching messages
      console.log(`📊 Syncing SMS stats for ${client.name}...`);
      const smsStatsResult = await this.fetchAndStoreSmsStats(client);

      // ⚡ Skip storing SMS messages/replies (fetched on-demand via /contact/:id endpoint)
      console.log(`💬 Skipping SMS message storage — will be fetched on-demand via /contact/:id?smsId=`);
      // Fetch click trackables for emails (if we fetched metadata)
      try {
        if (emails && emails.length > 0) {
          await this.fetchAllEmailClickStats(client, emails);
          
          // Aggregate click trackables and update email records with clickedCount AND uniqueClicks
          console.log(`📊 Aggregating total clicks and unique clicks into email records...`);
          const emailIds = emails.map(e => parseInt(e.id, 10)).filter(Boolean);
          const clickAggregates = await prisma.mauticClickTrackable.groupBy({
            by: ['channelId'],
            where: { channelId: { in: emailIds }, clientId: client.id },
            _sum: { 
              hits: true,        // Total clicks (clickedCount)
              uniqueHits: true   // Unique clicks
            }
          });
          
          const clickMap = new Map(clickAggregates.map(agg => [
            String(agg.channelId), 
            {
              clickedCount: parseInt(agg._sum.hits || 0, 10),
              uniqueClicks: parseInt(agg._sum.uniqueHits || 0, 10)
            }
          ]));
          
          let updatedCount = 0;
          for (const email of emails) {
            const emailId = String(email.id);
            const clickData = clickMap.get(emailId);
            if (clickData && (clickData.clickedCount > 0 || clickData.uniqueClicks > 0)) {
              try {
                const sentCount = parseInt(email.sentCount || 0, 10);
                const clickRate = sentCount > 0 
                  ? parseFloat(((clickData.clickedCount / sentCount) * 100).toFixed(2))
                  : 0;

                const res = await prisma.mauticEmail.updateMany({
                  where: {
                    clientId: client.id,
                    mauticEmailId: String(emailId)
                  },
                  data: { 
                    clickedCount: clickData.clickedCount,
                    uniqueClicks: clickData.uniqueClicks,
                    clickRate: clickRate
                  }
                });

                if (res && res.count) updatedCount += res.count;
              } catch (e) {
                console.warn(`Failed to update click counts for email ${emailId}:`, e.message || e);
              }
            }
          }
          console.log(`✅ Updated ${updatedCount} email records with click counts (total + unique)`);
        }
      } catch (e) {
        console.warn('Failed to fetch/save click trackables (non-fatal):', e.message || e);
      }

      return {
        success: true,
        data: {
          emails,
          campaigns,
          segments,
          smses,
          emailReports: {
            totalRows: emailReportResult.totalRows,
            created: emailReportResult.created,
            skipped: emailReportResult.skipped
          },
          smsStats: {
            totalStats: smsStatsResult.totalStats || 0,
            campaignsProcessed: smsStatsResult.campaignsProcessed || 0
          }
        }
      };
    } catch (error) {
      console.error('Error syncing data:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

export default new MauticAPIService();