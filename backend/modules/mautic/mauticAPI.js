import axios from 'axios';
import http from 'http';
import https from 'https';
import encryptionService from './encryption.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
// pLimit removed - no longer using concurrency, pure sequential processing
import prisma from '../../prisma/client.js';
import logger from '../../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class MauticAPIService {
  constructor() {
    // ⚡ Add global request interceptor for logging and performance monitoring
    this.setupInterceptors();
  }

  /**
   * Setup axios interceptors for better error handling and logging
   */
  setupInterceptors() {
    // Request interceptor - log outgoing requests
    axios.interceptors.request.use(
      (config) => {
        config.metadata = { startTime: Date.now() };
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Response interceptor - log response times and handle common errors
    axios.interceptors.response.use(
      (response) => {
        const duration = Date.now() - response.config.metadata.startTime;
        if (duration > 5000) {
          console.warn(`⚠️  Slow API response: ${response.config.url} took ${duration}ms`);
        }
        return response;
      },
      (error) => {
        if (error.config?.metadata) {
          const duration = Date.now() - error.config.metadata.startTime;
          console.error(`❌ API request failed after ${duration}ms: ${error.config.url}`);
        }
        return Promise.reject(error);
      }
    );
  }

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
        'Content-Type': 'application/json',
        'Accept-Encoding': 'gzip, deflate', // ⚡ Enable compression
        'Connection': 'keep-alive' // ⚡ Reuse connections
      },
      timeout: 300000, // ⚡ 5 minutes for large report fetches
      maxRedirects: 5,
      // ⚡ Connection pooling for better performance
      httpAgent: new http.Agent({
        keepAlive: true,
        keepAliveMsecs: 30000,
        maxSockets: 50,
        maxFreeSockets: 10,
        timeout: 120000
      }),
      httpsAgent: new https.Agent({
        keepAlive: true,
        keepAliveMsecs: 30000,
        maxSockets: 50,
        maxFreeSockets: 10,
        timeout: 300000, // ⚡ 5 minutes for HTTPS
        rejectUnauthorized: true // ⚡ Validate SSL certificates
      })
    });

    return apiClient;
  }

  /**
   * Test Mautic connection with optimized lightwe
   * @param {Object} credentials - { mauticUrl, username, password }
   * @returns {Promise<Object>} { success: boolean, message: string }
   */
  /**
   * Test Mautic connection with enhanced error handling
   * @param {Object} credentials - { mauticUrl, username, password }
   * @returns {Promise<Object>} Connection test result
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
        // timeout: 30000 // 30 seconds for connection test
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
   * Check Mautic server health and performance
   * @param {string} mauticUrl - Mautic URL
   * @returns {Promise<Object>} Health check result
   */
  async checkServerHealth(mauticUrl) {
    try {
      const normalizedUrl = this.normalizeUrl(mauticUrl);
      const startTime = Date.now();

      // Simple HTTP request to check if server is reachable
      const response = await axios.get(normalizedUrl, {
        timeout: 10000,
        validateStatus: () => true // Accept any status
      });

      const responseTime = Date.now() - startTime;

      return {
        success: true,
        reachable: true,
        responseTime: responseTime,
        status: response.status,
        message: responseTime < 1000 ? 'Server is healthy' : 'Server is slow',
        performance: responseTime < 1000 ? 'good' : responseTime < 3000 ? 'moderate' : 'poor'
      };
    } catch (error) {
      return {
        success: false,
        reachable: false,
        error: error.message,
        code: error.code
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

      // Fetch with retry logic - Sequential for data integrity
      const emailStatsResp = await this.retryWithBackoff(async () => {
        return apiClient.get('/stats/email_stats', {
          params: {
            start: 0,
            limit: limit,
            'where[0][col]': 'email_id',
            'where[0][expr]': 'eq',
            'where[0][val]': emailId
          }
        });
      });

      const pageHitsResp = await this.retryWithBackoff(async () => {
        return apiClient.get('/stats/page_hits', {
          params: {
            start: 0,
            limit: limit,
            'where[0][col]': 'email_id',
            'where[0][expr]': 'eq',
            'where[0][val]': emailId
          }
        });
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
    const { default: dataService } = await import('./email/services/dataService.js');
    try {
      if (!emails || emails.length === 0) return { success: true, created: 0 };

      console.log(`📊 Fetching click trackables for ${emails.length} emails from ${client.name}...`);

      const apiClient = this.createClient(client);
      const clickRows = [];

      // Pure SEQUENTIAL processing (no pLimit, no Promise.all)
      console.log(`   🔍 Processing mode: Pure sequential (one email at a time, no concurrency)`);

      const fetchStartTime = Date.now();

      // Process each email one by one (pure sequential)
      for (let index = 0; index < emails.length; index++) {
        const email = emails[index];

        try {
          const emailId = email.id || email.mauticEmailId || email.e_id;
          const emailName = email.name || 'Unnamed';

          if (!emailId) {
            console.log(`   ⚠️  [${index + 1}/${emails.length}] Skipping - No email ID found`);
            continue;
          }

          console.log(`   📧 [${index + 1}/${emails.length}] Fetching click data for email ID: ${emailId} (${emailName.substring(0, 50)})`);

          // Fetch with pagination to handle 403 responses that limit to 100 records
          let allRawRows = [];
          let currentStart = 0;
          const pageSize = 10000; // Request large page size
          let hasMore = true;
          let pageNum = 0;

          while (hasMore) {
            pageNum++;

            try {
              const resp = await apiClient.get('/stats/channel_url_trackables', {
                params: {
                  'where[0][col]': 'channel_id',
                  'where[0][expr]': 'eq',
                  'where[0][val]': emailId,
                  limit: pageSize,
                  start: currentStart
                }
              });

              const pageRows = resp.data?.stats || resp.data || [];

              if (pageNum === 1) {
                console.log(`      ✅ Received ${pageRows.length} click trackable records from API`);
              } else {
                console.log(`      ✅ Page ${pageNum}: Received ${pageRows.length} more records`);
              }

              if (pageRows.length > 0) {
                allRawRows.push(...pageRows);

                if (pageNum === 1 && pageRows.length > 0) {
                  console.log(`      📊 Sample: redirectId=${pageRows[0].redirect_id}, hits=${pageRows[0].hits}, uniqueHits=${pageRows[0].unique_hits}`);
                }

                // If we got fewer records than requested, we've reached the end
                if (pageRows.length < pageSize) {
                  hasMore = false;
                } else {
                  currentStart += pageRows.length;
                }
              } else {
                hasMore = false;
              }
            } catch (pageError) {
              // Handle 403 or other errors with pagination
              if (pageError.response && pageError.response.data) {
                const errorData = pageError.response.data;
                const pageRows = errorData.stats || (Array.isArray(errorData) ? errorData : []);

                if (Array.isArray(pageRows) && pageRows.length > 0) {
                  if (pageNum === 1) {
                    console.log(`      ⚠️  Got ${pageError.response.status} error but received ${pageRows.length} records`);
                    console.log(`      📊 Processing data despite error status`);
                    console.log(`      📊 Sample: redirectId=${pageRows[0].redirect_id}, hits=${pageRows[0].hits}, uniqueHits=${pageRows[0].unique_hits}`);
                  } else {
                    console.log(`      ⚠️  Page ${pageNum}: Got ${pageError.response.status} error but received ${pageRows.length} more records`);
                  }

                  allRawRows.push(...pageRows);

                  // Check if we got a full page (likely more data available)
                  if (pageRows.length >= 100) {
                    // 403 responses seem to default to 100 records, try next page
                    currentStart += pageRows.length;
                    console.log(`      🔄 Fetching next page (got full page of ${pageRows.length}, might be more)...`);
                  } else {
                    // Got less than 100, probably the last page
                    hasMore = false;
                  }
                } else {
                  // No data in error response
                  console.error(`      ❌ Error with no data: ${pageError.message}`);
                  hasMore = false;
                }
              } else {
                // Error without response data
                console.error(`      ❌ Error: ${pageError.message}`);
                hasMore = false;
              }
            }
          }

          if (allRawRows.length > 100) {
            console.log(`      ✅ Total fetched: ${allRawRows.length} records across ${pageNum} page(s)`);
          }

          const mapped = allRawRows.map((r, rIndex) => {
            const record = {
              redirect_id: r.redirect_id || r.id || r.redirectId || '',
              hits: parseInt(r.hits || r.hits_count || 0, 10) || 0,
              unique_hits: parseInt(r.unique_hits || r.unique_hits_count || r.uniqueHits || 0, 10) || 0,
              channel_id: parseInt(emailId, 10) || 0,
              url: r.url || r.path || null
            };

            // Log invalid records
            if (!record.redirect_id || !record.channel_id) {
              console.log(`      ⚠️  Invalid record [${rIndex}]: redirectId=${record.redirect_id}, channelId=${record.channel_id}`);
            }

            return record;
          });

          clickRows.push(...mapped);
        } catch (e) {
          // This catch is for unexpected errors outside the pagination logic
          console.error(`   ❌ [${index + 1}/${emails.length}] Unexpected error for email ${email.id}:`, e.message || e);
        }
      }

      const fetchDuration = ((Date.now() - fetchStartTime) / 1000).toFixed(2);
      console.log(`   ✅ Collection complete: ${clickRows.length} total click records from ${emails.length} emails in ${fetchDuration}s`);
      console.log(`   📊 Average: ${(clickRows.length / emails.length).toFixed(1)} records per email`);

      // Deduplicate rows by composite key (clientId + channelId + redirectId)
      // This prevents losing data when same redirectId appears in different emails
      console.log(`\n   🔄 Starting deduplication process...`);
      console.log(`      Input: ${clickRows.length} records`);

      const dedupMap = new Map();
      let duplicateCount = 0;
      let invalidCount = 0;

      for (const row of clickRows) {
        // Validate record
        if (!row.redirect_id || !row.channel_id) {
          invalidCount++;
          console.log(`      ⚠️  Skipping invalid record: redirectId=${row.redirect_id}, channelId=${row.channel_id}`);
          continue;
        }

        // Create composite key to preserve per-email click data
        const key = `${client.id}|${row.channel_id}|${row.redirect_id}`;

        if (!dedupMap.has(key)) {
          dedupMap.set(key, row);
        } else {
          duplicateCount++;
          // If duplicate within same email, keep max values
          const existing = dedupMap.get(key);
          const oldHits = existing.hits;
          const oldUniqueHits = existing.unique_hits;

          existing.hits = Math.max(existing.hits, row.hits || 0);
          existing.unique_hits = Math.max(existing.unique_hits, row.unique_hits || 0);

          if (existing.hits !== oldHits || existing.unique_hits !== oldUniqueHits) {
            console.log(`      🔄 Updated duplicate: channelId=${row.channel_id}, redirectId=${row.redirect_id}`);
            console.log(`         Hits: ${oldHits} → ${existing.hits}, UniqueHits: ${oldUniqueHits} → ${existing.unique_hits}`);
          }
        }
      }

      const deduped = Array.from(dedupMap.values());
      console.log(`      ✅ Deduplication complete:`);
      console.log(`         Original: ${clickRows.length}`);
      console.log(`         Invalid: ${invalidCount}`);
      console.log(`         Duplicates: ${duplicateCount}`);
      console.log(`         Final unique: ${deduped.length}`);

      console.log(`\n   💾 Saving ${deduped.length} unique records to database...`);
      const saveResult = await dataService.saveClickTrackables(client.id, deduped);

      console.log(`\n✅ Click trackables processing complete:`);
      console.log(`   📊 Summary:`);
      console.log(`      - API returned: ${clickRows.length} records`);
      console.log(`      - After deduplication: ${deduped.length} unique`);
      console.log(`      - Created in DB: ${saveResult.created}`);
      console.log(`      - Updated in DB: ${saveResult.updated || 0}`);
      console.log(`      - Total processed: ${(saveResult.created || 0) + (saveResult.updated || 0)}/${deduped.length}`);

      if ((saveResult.created === 0 && saveResult.updated === 0) && deduped.length > 0) {
        console.warn(`\n⚠️  WARNING: ${deduped.length} trackables processed but 0 saved/updated!`);
        console.warn(`   Possible reasons:`);
        console.warn(`   - Database errors (check logs above)`);
        console.warn(`   - Invalid data (check validation errors)`);
        console.warn(`   - Constraint violations`);
      }

      return saveResult;
    } catch (error) {
      console.error('❌ Error fetching click trackables:', error.message || error);
      console.error('Stack trace:', error.stack);
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
      console.log(`   📊 Processing mode: Pure sequential (one segment at a time)`);

      // Process each segment one by one (pure sequential)
      for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];

        try {
          console.log(`   📋 [${i + 1}/${segments.length}] Counting contacts for: ${segment.name}`);

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
            console.log(`      ✅ ${segment.name}: ${count} contacts`);
          } else {
            console.log(`      ⚪ ${segment.name}: 0 contacts`);
          }
        } catch (error) {
          console.error(`      ⚠️  Failed to count for segment ${segment.id} (${segment.name}): ${error.message}`);
          segment.leadCount = 0;
        }
      }

      const totalContacts = segments.reduce((sum, seg) => sum + (seg.leadCount || 0), 0);
      console.log(`\n✅ Contact count complete! Total across all segments: ${totalContacts}`);

      return segments;
    } catch (error) {
      console.error('Error fetching segments:', error.message);
      throw new Error(`Failed to fetch segments: ${error.message}`);
    }
  }

  /**
   * Fetch click trackable records for a specific email from Mautic stats API
   * @param {Object} client - Client configuration
   * @param {string} emailId - Mautic email ID
   * @returns {Promise<Array>} Array of click trackable records
   */
  async fetchEmailClickStats(client, emailId) {
    try {
      const apiClient = this.createClient(client);
      const response = await apiClient.get('/stats/channel_url_trackables', {
        params: {
          'where[0][col]': 'channel_id',
          'where[0][expr]': 'eq',
          'where[0][val]': emailId
        }
      });

      return response.data?.stats || [];
    } catch (error) {
      console.error(`Error fetching click stats for email ${emailId}:`, error.message);
      return []; // Return empty array on error
    }
  }

  /**
   * Fetch click trackable records for all emails in batch with retry logic
   * @param {Object} client - Client configuration
   * @param {Array} emails - Array of email objects
   * @returns {Promise<Object>} Result with success flag, clickRows array, and error if any
   */
  async fetchAllEmailClickStats(client, emails) {
    try {
      console.log(`📊 Fetching click trackable records for ${emails.length} emails...`);
      const clickRows = [];

      // Import dataService to save click trackables incrementally
      const { default: dataService } = await import('./email/services/dataService.js');

      // Process in batches of 10 concurrently
      const batchSize = 10;
      for (let i = 0; i < emails.length; i += batchSize) {
        const batch = emails.slice(i, i + batchSize);
        const results = await Promise.allSettled(
          batch.map(async (email) => {
            const stats = await this.fetchEmailClickStats(client, email.id);
            return { emailId: email.id, stats };
          })
        );

        for (const r of results) {
          if (r.status === 'fulfilled') {
            const { emailId, stats } = r.value;
            for (const s of stats) {
              clickRows.push({
                redirect_id: s.redirect_id || s.redirectId,
                hits: s.hits || 0,
                unique_hits: s.unique_hits || s.uniqueHits || 0,
                channel_id: emailId,
                url: s.url || null
              });
            }
          }
        }

        console.log(`   Processed ${Math.min(i + batchSize, emails.length)}/${emails.length} emails (${clickRows.length} click records)...`);

        // Save incrementally every 500 records to avoid memory issues
        if (clickRows.length >= 500) {
          try {
            await dataService.saveClickTrackables(client.id, clickRows);
            console.log(`   💾 Saved ${clickRows.length} click trackables to database (incremental save)...`);
            clickRows.length = 0; // Clear array
          } catch (saveErr) {
            console.warn(`   ⚠️  Failed to save click trackables incrementally: ${saveErr.message}`);
          }
        }
      }

      // Save any remaining click trackables
      if (clickRows.length > 0) {
        try {
          await dataService.saveClickTrackables(client.id, clickRows);
          console.log(`   💾 Saved final ${clickRows.length} click trackables to database...`);
        } catch (saveErr) {
          console.warn(`   ⚠️  Failed to save final click trackables: ${saveErr.message}`);
        }
      }

      console.log(`✅ Click trackable fetch complete`);
      return { success: true, clickRows: [] }; // Return empty since we saved incrementally
    } catch (error) {
      console.error(`❌ Error fetching click trackables:`, error.message);
      return { success: false, error: error.message, clickRows: [] };
    }
  }

  /**
   * Fetch bounce stats for all emails
   * @param {Object} client - Client configuration
   * @param {Array} emails - Array of email objects
   * @returns {Promise<Array>} Array of bounce event records
   */
  async fetchBounceStats(client, emails) {
    console.log(`❌ Fetching bounce stats for ${emails.length} emails...`);
    const eventRows = [];

    const batchSize = 10;
    for (let i = 0; i < emails.length; i += batchSize) {
      const batch = emails.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map(async (email) => {
          try {
            const apiClient = this.createClient(client);
            const response = await apiClient.get('/stats/email_stats', {
              params: {
                'where[0][col]': 'email_id',
                'where[0][expr]': 'eq',
                'where[0][val]': email.id,
                'where[1][col]': 'is_failed',
                'where[1][expr]': 'eq',
                'where[1][val]': 1
              }
            });
            return { emailId: email.id, stats: response.data?.stats || [] };
          } catch (e) {
            return { emailId: email.id, stats: [] };
          }
        })
      );

      for (const r of results) {
        if (r.status === 'fulfilled') {
          const { emailId, stats } = r.value;
          for (const s of stats) {
            eventRows.push({ ...s, email_id: emailId, eventType: 'bounce' });
          }
        }
      }

      console.log(`   Processed ${Math.min(i + batchSize, emails.length)}/${emails.length} emails (${eventRows.length} bounces)...`);
    }

    console.log(`✅ Bounce stats collected: ${eventRows.length}`);
    return eventRows;
  }

  /**
   * Fetch unsubscribe events for all emails
   * @param {Object} client - Client configuration
   * @param {Array} emails - Array of email objects
   * @returns {Promise<Array>} Array of unsubscribe event records
   */
  async fetchUnsubscribeStats(client, emails) {
    console.log(`🚫 Fetching unsubscribe stats for ${emails.length} emails...`);
    const eventRows = [];

    const batchSize = 10;
    for (let i = 0; i < emails.length; i += batchSize) {
      const batch = emails.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map(async (email) => {
          try {
            const apiClient = this.createClient(client);
            const response = await apiClient.get('/stats/lead_event_log', {
              params: {
                'where[0][col]': 'bundle',
                'where[0][expr]': 'eq',
                'where[0][val]': 'email',
                'where[1][col]': 'object_id',
                'where[1][expr]': 'eq',
                'where[1][val]': email.id,
                'where[2][col]': 'action',
                'where[2][expr]': 'eq',
                'where[2][val]': 'unsubscribed'
              }
            });
            return { emailId: email.id, stats: response.data?.stats || [] };
          } catch (e) {
            return { emailId: email.id, stats: [] };
          }
        })
      );

      for (const r of results) {
        if (r.status === 'fulfilled') {
          const { emailId, stats } = r.value;
          for (const s of stats) {
            eventRows.push({ ...s, email_id: emailId, eventType: 'unsubscribed' });
          }
        }
      }

      console.log(`   Processed ${Math.min(i + batchSize, emails.length)}/${emails.length} emails (${eventRows.length} unsubscribes)...`);
    }

    console.log(`✅ Unsubscribe stats collected: ${eventRows.length}`);
    return eventRows;
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
    const { default: dataService } = await import('./email/services/dataService.js');

    try {
      const apiClient = this.createClient(client);
      const reportId = client.reportId;

      if (!reportId) {
        throw new Error(`No reportId found for client: ${client.name}`);
      }

      // ⚡ Use reasonable chunk size that Mautic API can handle
      const limit = parseInt('5000', 10); // 5000 is a safe limit for most Mautic instances
      let hasMore = true;
      let totalRows = 0;
      let totalCreated = 0;
      let totalSkipped = 0;
      let pageNumber = 1; // Mautic reports API uses 1-based page numbers

      // ⚡⚡⚡ INTELLIGENT INCREMENTAL SYNC - Only fetch NEW data!
      let lastFetchedReport = null;
      try {
        lastFetchedReport = await prisma.mauticEmailReport.findFirst({
          where: { clientId: client.id },
          orderBy: { dateSent: 'desc' },
          select: { dateSent: true }
        });
      } catch (e) {
        console.warn(`   ⚠️  Could not check last fetched report: ${e.message}`);
      }

      // ⚡ CRITICAL OPTIMIZATION: If we just fetched recently, skip entirely!
      if (lastFetchedReport?.dateSent) {
        const lastDate = lastFetchedReport.dateSent;
        const hoursSinceLastFetch = (Date.now() - new Date(lastDate).getTime()) / (1000 * 60 * 60);
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
        : '2024-05-20'; // Default start date for full sync

      console.log(`📊 Fetching report ID ${reportId} for ${client.name}${dateFrom ? ` (since ${dateFrom} - INCREMENTAL!)` : ' (full sync)'}...`);
      console.log(`   Storage mode: RAW (full detail, one record per email event)`);
      console.log(`   Chunk size: ${limit} records per request (PHP-friendly)`);

      const fetchStartTime = Date.now();

      // Fetch and save in batches (per-batch processing for raw storage)
      while (hasMore) {
        const pageStartTime = Date.now();

        // Use 'page' parameter instead of 'start' for reports API
        // Mautic reports API uses 1-based page numbers, not offset-based pagination
        const params = {
          page: pageNumber,
          limit: limit,
          dateFrom: dateFrom
        };

        console.log(`   📄 Page ${pageNumber}: Fetching from Mautic (page=${pageNumber}, limit=${limit})...`);

        const response = await this.retryWithBackoff(async () => {
          return await apiClient.get(`/reports/${reportId}`, { params });
        }, 6, 1000); // 6 retries with 1s initial delay

        const pageDuration = ((Date.now() - pageStartTime) / 1000).toFixed(2);
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

        console.log(`   ✅ Page ${pageNumber}: Fetched ${batchRows.length} rows in ${pageDuration}s (Total: ${totalAvailable || '?'}, Progress: ${totalRows + batchRows.length}/${totalAvailable || '?'})`);

        if (batchRows.length === 0 && totalRows === 0 && totalAvailable === 0) {
          console.log(`⚡ INSTANT EXIT: No data available (already up to date!)`);
          hasMore = false;
          break;
        }

        // Save batch immediately (per-batch processing for raw storage)
        if (batchRows.length > 0) {
          try {
            const saveResult = await dataService.saveEmailReports(client.id, batchRows);
            totalCreated += saveResult.created;
            totalSkipped += saveResult.skipped;
            totalRows += batchRows.length;
            console.log(`   💾 Saved: ${saveResult.created} new, ${saveResult.skipped} duplicates (Total: ${totalCreated} created, ${totalSkipped} skipped)`);
          } catch (saveError) {
            console.error(`   ❌ Save error for page ${pageNumber}:`, saveError.message);
            // Continue to next page even if save fails
          }

          // 🧹 MEMORY CLEANUP: Clear batch data and hint garbage collection
          batchRows.length = 0;
          if (global.gc && pageNumber % 10 === 0) {
            global.gc();
            console.log(`   🧹 Memory cleanup triggered (page ${pageNumber})`);
          }
        }

        if (batchRows.length === 0) {
          console.log(`✅ Stopping: No more data returned`);
          hasMore = false;
        } else if (totalAvailable > 0 && totalRows >= totalAvailable) {
          console.log(`✅ Stopping: Reached total (${totalRows}/${totalAvailable})`);
          hasMore = false;
        } else if (batchRows.length < limit && (!totalAvailable || totalRows >= totalAvailable)) {
          console.log(`✅ Stopping: Partial batch (${batchRows.length} < ${limit})`);
          hasMore = false;
        } else {
          // Move to next page (page-based pagination, not offset-based)
          pageNumber++;
          hasMore = true;

          // ⚡ Add small delay between chunks to avoid overwhelming PHP server
          if (hasMore && pageNumber % 5 === 0) {
            const delayMs = parseInt('500', 10);
            console.log(`   ⏸️  Pausing ${delayMs}ms to avoid overwhelming server...`);
            await new Promise(resolve => setTimeout(resolve, delayMs));
          }
        }
      }

      const totalDuration = ((Date.now() - fetchStartTime) / 1000).toFixed(2);
      const avgTimePerPage = pageNumber > 0 ? (totalDuration / pageNumber).toFixed(2) : 0;

      console.log(`\n✅ Report complete: ${totalRows} rows in ${totalDuration}s (${pageNumber} pages, avg ${avgTimePerPage}s/page)`);
      console.log(`   💾 Storage: ${totalCreated} created, ${totalSkipped} skipped`);

      return {
        success: true,
        totalRows,
        created: totalCreated,
        skipped: totalSkipped,
        pages: pageNumber,
        durationSeconds: parseFloat(totalDuration)
      };

    } catch (error) {
      console.error(`❌ Error fetching report for client ${client.name}:`, error.message);
      console.error(`   Stack:`, error.stack);
      throw new Error(`Failed to fetch report for client ${client.name}: ${error.message}`);
    }
  }

  /**
   * Fetch historical reports for a specific date range (used for backfilling)
   * ⚡ OPTIMIZATION: This is a HEAVY operation - should be called ONLY during manual backfill
   * NOT during client creation! Client creation should only fetch lightweight metadata.
   * @param {Object} client - Client object
   * @param {string} fromDate - Start date (YYYY-MM-DD)
   * @param {string} toDate - End date (YYYY-MM-DD)
   * @param {number} limit - API limit per batch
   * @returns {Object} Fetch results
   */
  async fetchHistoricalReports(client, fromDate, toDate, limit = 200000) {
    const { default: dataService } = await import('./email/services/dataService.js');
    try {
      const apiClient = this.createClient(client);
      const reportId = client.reportId;

      if (!reportId) {
        throw new Error(`No reportId found for client: ${client.name}`);
      }

      // Bound the limit to a sensible default if caller passed something too large
      const PAGE_LIMIT = Math.max(1000, Math.min(parseInt(limit, 10) || 5000, 200000));
      const RETRIES = 6;
      const CONCURRENCY = 1; // ⚠️ CRITICAL: Sequential to prevent database race conditions

      console.log(`⚠️  Historical fetch mode: SEQUENTIAL (CONCURRENCY=1) to prevent data loss`);
      console.log(`   This ensures saveEmailReports() doesn't have concurrent write conflicts`);

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

      console.log(`📅 Fetching historical reports (page-mode) ${fromDate} → ${toDate} for ${client.name}`);
      console.log(`   Page limit: ${PAGE_LIMIT}, Concurrency: ${CONCURRENCY} (sequential for safety)`);

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
        console.log(`   🔄 Processing ${totalPages - 1} additional pages sequentially (one by one)...`);

        // Process each page one by one (pure sequential)
        for (let p = 2; p <= totalPages; p++) {
          try {
            console.log(`      📄 Page ${p}/${totalPages}: Fetching from Mautic...`);
            const payload = await fetchPage(p);

            if (!payload || !Array.isArray(payload.data)) {
              console.warn(`      ⚠️  Page ${p}: No data returned`);
              continue;
            }

            console.log(`      ✅ Page ${p}: Fetched ${payload.data.length} records`);
            savePage(p, payload);

            try {
              console.log(`      💾 Page ${p}: Saving to database...`);
              const r = await dataService.saveEmailReports(client.id, payload.data);
              console.log(`      ✅ Page ${p}: Saved ${r.created} new, ${r.skipped} skipped`);
              totalCreated += r.created || 0;
              totalSkipped += r.skipped || 0;
            } catch (e) {
              console.error(`      ❌ Page ${p}: Save error - ${e.message}`);
            }
          } catch (e) {
            console.error(`      ❌ Page ${p}: Fetch error - ${e.message}`);
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
   * Sync all data for a client (emails, campaigns, segments, SMS campaigns, reports)
   * Email reports are saved to database during fetch (streaming)
   * ⚡ ULTRA OPTIMIZED: Skips metadata on incremental sync for 1000x speed!
   * For SMS-only clients (reportId='sms-only'), only fetches SMS campaigns
   * @param {Object} client - Client configuration
   * @returns {Promise<Object>} Sync results
   */
  async syncAllData(client) {
    try {
      console.log(`🔄 Starting sync for ${client.name}...`);

      // ✅ Check if this is an SMS-only client
      const isSmsOnly = client.reportId === 'sms-only';

      if (isSmsOnly) {
        console.log(`📱 SMS-ONLY CLIENT - Fetching SMS campaigns only...`);

        // For SMS-only clients, only fetch SMS campaigns
        const smsCampaigns = await this.fetchSmses(client);

        // Persist SMS campaigns to DB with smart categorization
        if (smsCampaigns && smsCampaigns.length > 0) {
          try {
            const { default: smsService } = await import('./sms/services/smsService.js');

            // 🧹 CLEANUP: Fix orphaned smsClientId references before sync to prevent foreign key violations
            await smsService.cleanupOrphanedReferences();

            // Get all active Mautic clients for categorization (exclude sms-only clients)
            const allMauticClients = await prisma.mauticClient.findMany({
              where: {
                isActive: true,
                NOT: { reportId: 'sms-only' }
              },
              select: { id: true, name: true, reportId: true }
            });

            const smsSaveRes = await smsService.storeSmsForMauticClient(client.id, smsCampaigns, allMauticClients);
            console.log(`   ✅ Saved SMS campaigns to DB: created=${smsSaveRes.created} updated=${smsSaveRes.updated} preserved=${smsSaveRes.preserved} categorized=${smsSaveRes.categorized}`);
          } catch (smsErr) {
            console.warn('   ⚠️ Failed to save SMS campaigns to DB (non-fatal):', smsErr.message || smsErr);
          }
        }

        // ✅ Fetch and store SMS stats for each campaign with BACKFILL
        // This is INDEPENDENT from SMS campaign save - runs even if save failed
        if (smsCampaigns && smsCampaigns.length > 0) {
          console.log(`\n📊 Fetching SMS stats for ${smsCampaigns.length} campaigns...`);

          // Create backfill storage
          const backfillDir = path.join(__dirname, '..', '..', '.temp_pages', 'sms-stats-backfill');
          if (!fs.existsSync(backfillDir)) {
            fs.mkdirSync(backfillDir, { recursive: true });
          }

          const backfillFile = path.join(backfillDir, `sms-${client.id}-${Date.now()}.json`);
          const backfillData = {
            clientId: client.id,
            clientName: client.name,
            isSmsOnly: true,
            startTime: new Date().toISOString(),
            campaigns: {}
          };

          let totalStatsCreated = 0;
          let totalStatsSkipped = 0;
          let successfulCampaigns = [];

          // 🎯 PRIORITY: Fetch autovation client SMS campaigns first
          const automationSmsCampaigns = [];
          const smsOnlySmsCampaigns = [];

          for (const sms of smsCampaigns) {
            const localSms = await prisma.mauticSms.findUnique({
              where: { mauticId: sms.id },
              select: { id: true, clientId: true, name: true }
            });

            if (localSms) {
              if (localSms.clientId) {
                automationSmsCampaigns.push({ ...sms, localId: localSms.id });
              } else {
                smsOnlySmsCampaigns.push({ ...sms, localId: localSms.id });
              }
            }
          }

          console.log(`   🎯 Priority: ${automationSmsCampaigns.length} automation SMS, ${smsOnlySmsCampaigns.length} SMS-only`);

          // Process automation SMS first (priority for UI display)
          const orderedCampaigns = [...automationSmsCampaigns, ...smsOnlySmsCampaigns];

          // Fetch mobile numbers and replies of all leads of this client in bulk once
          // STEP 1: FETCH ALL LEAD IDs FOR EACH SMS CAMPAIGN FIRST
          const apiClient = this.createClient(client);

          logger.info(`   🔍 Gathering lead IDs for all ${smsCampaigns.length} SMS campaigns...`);

          const allUniqueLeadIds = new Set();         // Unique IDs across all campaigns
          const allCampaignsLeads = new Map();        // Map<campaignId, leads array>

          for (const campaign of smsCampaigns) {
            const mauticSmsId = campaign.id;
            logger.info(`   🔍 Fetching lead IDs for campaign ${mauticSmsId}...`);

            const campaignLeadIds = [];
            const campaignLeads = [];

            let tempStart = 0;
            const tempLimit = 5000;
            let hasMoreLeads = true;

            while (hasMoreLeads) {
              try {
                const resp = await this.retryWithBackoff(() =>
                  apiClient.get("/stats/sms_message_stats", {
                    params: {
                      "where[0][col]": "sms_id",
                      "where[0][expr]": "eq",
                      "where[0][val]": mauticSmsId,
                      start: tempStart,
                      limit: tempLimit,
                      orderBy: "date_sent",
                      orderByDir: "desc",
                    },
                  })
                );

                // Normalize response shape
                const stats = Array.isArray(resp.data?.stats)
                  ? resp.data.stats
                  : resp.data?.stats && typeof resp.data.stats === "object"
                    ? Object.values(resp.data.stats)
                    : [];

                if (!stats.length) {
                  hasMoreLeads = false;
                  break;
                }

                const leadIds = stats.map((s) => s.lead_id || s.leadId).filter(Boolean);
                campaignLeadIds.push(...leadIds);
                campaignLeads.push(...stats);
                leadIds.forEach((id) => allUniqueLeadIds.add(id));

                tempStart += stats.length;
                if (stats.length < tempLimit) hasMoreLeads = false;
              } catch (err) {
                logger.error(`   ❌ Error fetching lead IDs for campaign ${mauticSmsId}: ${err.message}`);
                hasMoreLeads = false;
              }
            }

            logger.info(`   ✅ Found ${campaignLeadIds.length} leads for campaign ${mauticSmsId}`);
            allCampaignsLeads.set(mauticSmsId, campaignLeads);
          }

          const allLeadIds = Array.from(allUniqueLeadIds);
          logger.info(`   ✅ Total unique leads across all campaigns: ${allLeadIds.length}`);

          // STEP 2: FETCH MOBILE NUMBERS AND REPLIES FOR ALL LEADS (once per client)
          let mobileMap = new Map();
          let repliesMap = new Map();

          if (allLeadIds.length > 0) {
            logger.info(`   📱 Fetching mobiles and replies for ${allLeadIds.length} leads (once per client)...`);
            try {
              mobileMap = await this.fetchMobileNumbersBulk(client, allLeadIds);
              repliesMap = await this.fetchSmsRepliesBulk(client, allLeadIds);
              logger.info(`   ✅ Bulk fetch complete: ${mobileMap.size} mobiles, ${repliesMap.size} replies`);
            } catch (bulkErr) {
              logger.warn(`   ⚠️  Bulk fetch failed: ${bulkErr.message}`);
            }
          }

          // STEP 3: PROCESS EACH SMS CAMPAIGN SEQUENTIALLY
          for (let idx = 0; idx < orderedCampaigns.length; idx++) {
            const sms = orderedCampaigns[idx];
            const progress = `[${idx + 1}/${orderedCampaigns.length}]`;
            const priority = automationSmsCampaigns.find((s) => s.id === sms.id) ? "🎯" : "📱";

            try {
              console.log(`   ${progress} ${priority} Fetching "${sms.name}"...`);

              const campaignLeads = allCampaignsLeads.get(sms.id) || [];
              console.log("CAMPAIGN LEADS", campaignLeads);
              const statsResult = await this.fetchAndStoreSmsStats(
                client,
                sms.localId,
                sms.id,
                campaignLeads,
                mobileMap,
                repliesMap
              );

              // Backfill only summary (detailed data is in page files)
              backfillData.campaigns[sms.id] = {
                name: sms.name,
                localId: sms.localId,
                created: statsResult.created || 0,
                skipped: statsResult.skipped || 0,
                status: "success",
              };

              totalStatsCreated += statsResult.created || 0;
              totalStatsSkipped += statsResult.skipped || 0;
              successfulCampaigns.push(sms.name);
              console.log(`       ✅ ${statsResult.created || 0} created, ${statsResult.skipped || 0} skipped`);
            } catch (statsErr) {
              console.error(`   ${progress} ❌ ${statsErr.message}`);
              backfillData.campaigns[sms.id] = {
                name: sms.name,
                error: statsErr.message,
                status: "failed",
              };
            }
          }

          // Save backfill summary (keep the file, don't delete)
          backfillData.endTime = new Date().toISOString();
          backfillData.summary = {
            total: smsCampaigns.length,
            successful: successfulCampaigns.length,
            statsCreated: totalStatsCreated,
            statsSkipped: totalStatsSkipped
          };

          try {
            const summaryFile = path.join(backfillDir, `summary-${client.id}-${Date.now()}.json`);
            fs.writeFileSync(summaryFile, JSON.stringify(backfillData, null, 2));
            console.log(`   💾 Backfill summary: ${backfillFile}`);
          } catch (backfillErr) {
            console.warn(`   ⚠️  Failed to save backfill summary:`, backfillErr.message);
          }

          console.log(`\n✅ SMS stats complete: ${totalStatsCreated} created, ${totalStatsSkipped} skipped`);
        }

        console.log(`✅ SMS-only sync complete for ${client.name}: ${smsCampaigns.length} SMS campaigns`);

        return {
          success: true,
          client: client.name,
          smsCampaigns: smsCampaigns.length,
          isSmsOnly: true
        };
      }

      // // ⚡⚡⚡ SPEED BOOST: Check if we have any data already (for regular clients)
      // const hasExistingData = await prisma.mauticEmail.count({
      //   where: { clientId: client.id }
      // }) > 0;

      // ✅ CHECK: Skip SMS fetching if an SMS-only client exists with same URL
      // This prevents Mautic sync from re-fetching SMS campaigns from deleted SMS client instances
      const normalizedClientUrl = client.mauticUrl.trim().replace(/\/$/, '').toLowerCase();
      const smsOnlyClientExists = await prisma.mauticClient.findFirst({
        where: {
          reportId: 'sms-only',
          // MySQL doesn't support mode: 'insensitive', so we normalize both sides
          mauticUrl: normalizedClientUrl
        },
        select: { id: true, name: true }
      });

      const shouldSkipSms = !!smsOnlyClientExists;
      if (shouldSkipSms) {
        console.log(`⚠️  SKIPPING SMS FETCH: SMS-only client "${smsOnlyClientExists.name}" exists with same URL`);
        console.log(`   This prevents re-fetching SMS campaigns that should be managed by SMS client only`);
      }

      let emails = [];
      let campaigns = [];
      let segments = [];
      let smsCampaigns = [];

      // // Always fetch email metadata to keep sentCount and readCount up-to-date
      // // The /api/emails endpoint is fast and doesn't require individual /api/stats calls
      // // Only campaigns and segments are skipped on incremental sync (rarely change)
      // if (!hasExistingData) {
      //   // Full initial sync: fetch all metadata SEQUENTIALLY (step by step)
      //   console.log(`🚀 INITIAL SYNC - Fetching metadata sequentially (step by step)${shouldSkipSms ? '' : ' including SMS'}...`);

      //   console.log(`\n📧 Step 1/4: Fetching emails...`);
      //   emails = await this.fetchEmails(client, false); // ⚡ FALSE = NO individual stats fetch!
      //   console.log(`   ✅ Fetched ${emails.length} emails`);

      //   console.log(`\n🎯 Step 2/4: Fetching campaigns...`);
      //   campaigns = await this.fetchCampaigns(client);
      //   console.log(`   ✅ Fetched ${campaigns.length} campaigns`);

      //   console.log(`\n📋 Step 3/4: Fetching segments...`);
      //   segments = await this.fetchSegments(client);
      //   console.log(`   ✅ Fetched ${segments.length} segments`);

      //   // ✅ Only fetch SMS if no SMS-only client exists with same URL
      //   if (!shouldSkipSms) {
      //     console.log(`\n📱 Step 4/4: Fetching SMS campaigns...`);
      //     smsCampaigns = await this.fetchSmses(client);
      //     console.log(`   ✅ Fetched ${smsCampaigns.length} SMS campaigns`);
      //   } else {
      //     console.log(`\n📱 Step 4/4: Skipping SMS (SMS-only client exists)`);
      //     smsCampaigns = [];
      //   }

      //   console.log(`\n✅ Metadata fetch complete (sequential)`);
      // } else {
      //   // Incremental sync: fetch emails AND SMS sequentially (to update stats), skip campaigns/segments
        console.log(`🔄 INCREMENTAL SYNC for ${client.name} — fetching sequentially...`);

        console.log(`\n📧 Step 1: Fetching emails to update stats...`);
        emails = await this.fetchEmails(client, false);
        console.log(`   ✅ Fetched ${emails.length} emails`);

        // ✅ Only fetch SMS if no SMS-only client exists with same URL
        if (!shouldSkipSms) {
          console.log(`\n📱 Step 2: Fetching SMS campaigns to update stats...`);
          smsCampaigns = await this.fetchSmses(client);
          console.log(`   ✅ Fetched ${smsCampaigns.length} SMS campaigns`);
        } else {
          console.log(`\n📱 Step 2: Skipping SMS (SMS-only client exists)`);
          smsCampaigns = [];
        }

      //   console.log(`\n✅ Incremental fetch complete (sequential)`);
      // }

      // Persist emails to DB (upsert will update sentCount, readCount, etc.)
      try {
        const { default: dataService } = await import('./email/services/dataService.js');
        const saveRes = await dataService.saveEmails(client.id, emails);
        console.log(`   ✅ Saved emails to DB: created=${saveRes.created} updated=${saveRes.updated}`);
      } catch (saveErr) {
        console.warn('   ⚠️ Failed to save fetched emails to DB (non-fatal):', saveErr.message || saveErr);
      }

      // ✅ Persist campaigns to DB (only on initial sync)
      if (campaigns && campaigns.length > 0) {
        try {
          const { default: dataService } = await import('./email/services/dataService.js');
          const campSaveRes = await dataService.saveCampaigns(client.id, campaigns);
          console.log(`   ✅ Saved campaigns to DB: created=${campSaveRes.created} updated=${campSaveRes.updated}`);
        } catch (campErr) {
          console.warn('   ⚠️ Failed to save campaigns to DB (non-fatal):', campErr.message || campErr);
        }
      }

      // ✅ Persist segments to DB (only on initial sync)
      if (segments && segments.length > 0) {
        try {
          const { default: dataService } = await import('./email/services/dataService.js');
          const segSaveRes = await dataService.saveSegments(client.id, segments);
          console.log(`   ✅ Saved segments to DB: created=${segSaveRes.created} updated=${segSaveRes.updated}`);
        } catch (segErr) {
          console.warn('   ⚠️ Failed to save segments to DB (non-fatal):', segErr.message || segErr);
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
          console.log(`   ✅ Updated client totals for ${client.name}: contacts=${uniqueContacts}, emails=${emails.length}, campaigns=${campaigns.length}, segments=${segments.length}, sms=${smsCampaigns.length}`);
        } catch (uErr) {
          console.warn('Failed to update mauticClient totals (non-fatal):', uErr.message || uErr);
        }
      } catch (countErr) {
        console.warn('Failed to fetch unique contacts count from Mautic (non-fatal):', countErr.message || countErr);
      }

      // Fetch click trackables for emails (if we fetched metadata)
      try {
        if (emails && emails.length > 0) {
          console.log(`\n📊 Processing click trackables for ${emails.length} emails...`);

          const clickFetchResult = await this.fetchAllEmailClickStats(client, emails);

          if (!clickFetchResult.success) {
            console.warn(`   ⚠️  Click fetch reported failure: ${clickFetchResult.error}`);
          }

          // Aggregate click trackables and update email records with clickedCount AND uniqueClicks
          console.log(`\n📊 Aggregating click data from database...`);
          console.log(`   🔍 Looking up click data for ${emails.length} emails...`);

          const emailIds = emails.map(e => parseInt(e.id, 10)).filter(Boolean);
          console.log(`   📧 Valid email IDs to aggregate: ${emailIds.length}`);

          if (emailIds.length === 0) {
            console.warn(`   ⚠️  No valid email IDs found - skipping aggregation`);
          } else {
            const clickAggregates = await prisma.mauticClickTrackable.groupBy({
              by: ['channelId'],
              where: { channelId: { in: emailIds }, clientId: client.id },
              _sum: {
                hits: true,        // Total clicks (clickedCount)
                uniqueHits: true   // Unique clicks
              }
            });

            console.log(`   ✅ Aggregation complete: Found click data for ${clickAggregates.length} emails`);

            if (clickAggregates.length > 0) {
              // Log sample
              const sample = clickAggregates[0];
              console.log(`   📊 Sample: channelId=${sample.channelId}, totalHits=${sample._sum.hits}, uniqueHits=${sample._sum.uniqueHits}`);
            }

            const clickMap = new Map(clickAggregates.map(agg => [
              String(agg.channelId),
              {
                clickedCount: parseInt(agg._sum.hits || 0, 10),
                uniqueClicks: parseInt(agg._sum.uniqueHits || 0, 10)
              }
            ]));

            console.log(`   🗺️  Created click map with ${clickMap.size} entries`);

            let updatedCount = 0;
            let skippedCount = 0;

            console.log(`\n   💾 Updating email records with click data...`);

            for (const email of emails) {
              const emailId = String(email.id);
              const clickData = clickMap.get(emailId);

              if (clickData && (clickData.clickedCount > 0 || clickData.uniqueClicks > 0)) {
                try {
                  const sentCount = parseInt(email.sentCount || 0, 10);
                  const clickRate = sentCount > 0
                    ? parseFloat(((clickData.clickedCount / sentCount) * 100).toFixed(2))
                    : 0;

                  console.log(`      📧 Email ${emailId}: Updating with ${clickData.clickedCount} clicks (${clickData.uniqueClicks} unique), rate: ${clickRate}%`);

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

                  if (res && res.count) {
                    updatedCount += res.count;
                    if (res.count === 0) {
                      console.warn(`         ⚠️  Update returned 0 rows - email may not exist in DB`);
                    }
                  }
                } catch (e) {
                  console.error(`      ❌ Failed to update click counts for email ${emailId}:`, e.message || e);
                  skippedCount++;
                }
              } else {
                // No click data for this email
                skippedCount++;
              }
            }

            console.log(`\n   ✅ Email update complete:`);
            console.log(`      Total emails: ${emails.length}`);
            console.log(`      Updated with clicks: ${updatedCount}`);
            console.log(`      Skipped (no clicks): ${skippedCount}`);
          }
        } else {
          console.log(`\n   ℹ️  No emails to process for click trackables`);
        }
      } catch (e) {
        console.error(`\n❌ Failed to fetch/save click trackables:`, e.message || e);
        console.error(`   Stack:`, e.stack);
      }

      // ✅ Persist SMS campaigns to DB - With smart categorization
      if (smsCampaigns && smsCampaigns.length > 0) {
        try {
          const { default: smsService } = await import('./sms/services/smsService.js');

          // 🧹 CLEANUP: Fix orphaned smsClientId references before sync to prevent foreign key violations
          await smsService.cleanupOrphanedReferences();

          // Get all active Mautic clients for categorization (exclude sms-only clients)
          const allMauticClients = await prisma.mauticClient.findMany({
            where: {
              isActive: true,
              NOT: { reportId: 'sms-only' }
            },
            select: { id: true, name: true, reportId: true }
          });

          const smsSaveRes = await smsService.storeSmsForMauticClient(client.id, smsCampaigns, allMauticClients);
          console.log(`   ✅ Saved SMS campaigns to DB: created=${smsSaveRes.created} updated=${smsSaveRes.updated} preserved=${smsSaveRes.preserved} categorized=${smsSaveRes.categorized}`);
        } catch (smsErr) {
          console.error('   ❌ SMS campaign save failed:', smsErr.message || smsErr);
          console.error('   Stack:', smsErr.stack);
        }
      }

      // ✅ Fetch and store SMS stats for each campaign with BACKFILL to JSON
      // This is INDEPENDENT from SMS campaign save - runs even if save failed
      // MUST COMPLETE before email reports start
      if (smsCampaigns && smsCampaigns.length > 0) {
        console.log(`\n📊 PRIORITY: Fetching SMS stats for ${smsCampaigns.length} campaigns (BEFORE email reports)...`);

        // Create backfill storage for incremental saves
        const backfillDir = path.join(__dirname, '..', '..', '.temp_pages', 'sms-stats-backfill');
        if (!fs.existsSync(backfillDir)) {
          fs.mkdirSync(backfillDir, { recursive: true });
        }

        const backfillFile = path.join(backfillDir, `sms-${client.id}-${Date.now()}.json`);
        const backfillData = {
          clientId: client.id,
          clientName: client.name,
          startTime: new Date().toISOString(),
          campaigns: {}
        };

        let totalStatsCreated = 0;
        let totalStatsSkipped = 0;
        let successfulCampaigns = [];

        // 🎯 PRIORITY: Fetch automation client SMS campaigns first
        const automationSmsCampaigns = [];
        const smsOnlySmsCampaigns = [];

        for (const sms of smsCampaigns) {
          const localSms = await prisma.mauticSms.findUnique({
            where: { mauticId: sms.id },
            select: { id: true, clientId: true, name: true }
          });

          if (localSms) {
            if (localSms.clientId) {
              automationSmsCampaigns.push({ ...sms, localId: localSms.id });
            } else {
              smsOnlySmsCampaigns.push({ ...sms, localId: localSms.id });
            }
          }
        }

        console.log(`   🎯 Priority: ${automationSmsCampaigns.length} automation SMS, ${smsOnlySmsCampaigns.length} SMS-only`);

        // Process automation SMS first (priority for UI display)
        const orderedCampaigns = [...automationSmsCampaigns, ...smsOnlySmsCampaigns];

        // Fetch mobile numbers and replies of all leads of this client in bulk once
        // STEP 1: FETCH ALL LEAD IDs FOR EACH SMS CAMPAIGN FIRST
        const apiClient = this.createClient(client);

        logger.info(`   🔍 Gathering lead IDs for all ${smsCampaigns.length} SMS campaigns...`);

        const allUniqueLeadIds = new Set();         // Unique IDs across all campaigns
        const allCampaignsLeads = new Map();        // Map<campaignId, leads array>

        for (const campaign of smsCampaigns) {
          const mauticSmsId = campaign.id;
          logger.info(`   🔍 Fetching lead IDs for campaign ${mauticSmsId}...`);

          const campaignLeadIds = [];
          const campaignLeads = [];

          let tempStart = 0;
          const tempLimit = 5000;
          let hasMoreLeads = true;

          while (hasMoreLeads) {
            try {
              const resp = await this.retryWithBackoff(() =>
                apiClient.get("/stats/sms_message_stats", {
                  params: {
                    "where[0][col]": "sms_id",
                    "where[0][expr]": "eq",
                    "where[0][val]": mauticSmsId,
                    start: tempStart,
                    limit: tempLimit,
                    orderBy: "date_sent",
                    orderByDir: "desc",
                  },
                })
              );

              // Normalize response shape
              const stats = Array.isArray(resp.data?.stats)
                ? resp.data.stats
                : resp.data?.stats && typeof resp.data.stats === "object"
                  ? Object.values(resp.data.stats)
                  : [];

              if (!stats.length) {
                hasMoreLeads = false;
                break;
              }

              const leadIds = stats.map((s) => s.lead_id || s.leadId).filter(Boolean);
              campaignLeadIds.push(...leadIds);
              campaignLeads.push(...stats);
              leadIds.forEach((id) => allUniqueLeadIds.add(id));

              tempStart += stats.length;
              if (stats.length < tempLimit) hasMoreLeads = false;
            } catch (err) {
              logger.error(`   ❌ Error fetching lead IDs for campaign ${mauticSmsId}: ${err.message}`);
              hasMoreLeads = false;
            }
          }

          logger.info(`   ✅ Found ${campaignLeadIds.length} leads for campaign ${mauticSmsId}`);
          allCampaignsLeads.set(mauticSmsId, campaignLeads);
        }

        const allLeadIds = Array.from(allUniqueLeadIds);
        logger.info(`   ✅ Total unique leads across all campaigns: ${allLeadIds.length}`);

        // STEP 2: FETCH MOBILE NUMBERS AND REPLIES FOR ALL LEADS (once per client)
        let mobileMap = new Map();
        let repliesMap = new Map();

        if (allLeadIds.length > 0) {
          logger.info(`   📱 Fetching mobiles and replies for ${allLeadIds.length} leads (once per client)...`);
          try {
            mobileMap = await this.fetchMobileNumbersBulk(client, allLeadIds);
            repliesMap = await this.fetchSmsRepliesBulk(client, allLeadIds);
            logger.info(`   ✅ Bulk fetch complete: ${mobileMap.size} mobiles, ${repliesMap.size} replies`);
          } catch (bulkErr) {
            logger.warn(`   ⚠️  Bulk fetch failed: ${bulkErr.message}`);
          }
        }

        // STEP 3: PROCESS EACH SMS CAMPAIGN SEQUENTIALLY
        for (let idx = 0; idx < orderedCampaigns.length; idx++) {
          const sms = orderedCampaigns[idx];
          const progress = `[${idx + 1}/${orderedCampaigns.length}]`;
          const priority = automationSmsCampaigns.find((s) => s.id === sms.id) ? "🎯" : "📱";

          try {
            console.log(`   ${progress} ${priority} Fetching "${sms.name}"...`);

            const campaignLeads = allCampaignsLeads.get(sms.id) || [];
            console.log("CAMPAIGN LEADS", campaignLeads);
            
            const statsResult = await this.fetchAndStoreSmsStats(
              client,
              sms.localId,
              sms.id,
              campaignLeads,
              mobileMap,
              repliesMap
            );

            // Backfill only summary (detailed data is in page files)
            backfillData.campaigns[sms.id] = {
              name: sms.name,
              localId: sms.localId,
              created: statsResult.created || 0,
              skipped: statsResult.skipped || 0,
              status: "success",
            };

            totalStatsCreated += statsResult.created || 0;
            totalStatsSkipped += statsResult.skipped || 0;
            successfulCampaigns.push(sms.name);
            console.log(`       ✅ ${statsResult.created || 0} created, ${statsResult.skipped || 0} skipped`);
          } catch (statsErr) {
            console.error(`   ${progress} ❌ ${statsErr.message}`);
            backfillData.campaigns[sms.id] = {
              name: sms.name,
              error: statsErr.message,
              status: "failed",
            };
          }
        }

        // Save backfill data to JSON (keep the file, don't delete)
        backfillData.endTime = new Date().toISOString();
        backfillData.summary = {
          total: smsCampaigns.length,
          successful: successfulCampaigns.length,
          statsCreated: totalStatsCreated,
          statsSkipped: totalStatsSkipped
        };

        try {
          const summaryFile = path.join(backfillDir, `summary-${client.id}-${Date.now()}.json`);
          fs.writeFileSync(summaryFile, JSON.stringify(backfillData, null, 2));
          console.log(`\n   💾 Backfill summary: ${backfillFile}`);
        } catch (backfillErr) {
          console.warn(`   ⚠️  Failed to save backfill summary:`, backfillErr.message);
        }

        console.log(`\n✅ SMS STATS COMPLETE`);
        console.log(`   ✅ Successful: ${successfulCampaigns.length}/${smsCampaigns.length}`);
        console.log(`   📝 Created: ${totalStatsCreated}, Skipped: ${totalStatsSkipped}`);
      }

      // Fetch report data AFTER SMS stats complete (gives priority to SMS)
      // This is a long-running operation that saves directly to DB
      console.log(`\n✅ SMS stats complete. Now fetching email reports...`);
      const emailReportResult = await this.fetchReport(client);

      return {
        success: true,
        data: {
          emails,
          campaigns,
          segments,
          smsCampaigns,
          emailReports: {
            totalRows: emailReportResult.totalRows,
            created: emailReportResult.created,
            skipped: emailReportResult.skipped
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

  /**
   * Fetch all SMS campaigns from Mautic
   * @param {Object} client - Client configuration
   * @returns {Promise<Array>} Array of SMS campaign objects
   */
  async fetchSmses(client) {
    try {
      logger.info(`Fetching SMS campaigns from Mautic for client ${client.name}`);
      const apiClient = this.createClient(client);

      const response = await this.retryWithBackoff(() =>
        apiClient.get('/smses', {
          params: {
            limit: 9999,
            orderBy: 'id',
            orderByDir: 'asc'
          }
        })
      );

      const smses = response.data?.smses || {};
      const smsArray = Object.values(smses);

      logger.info(`Fetched ${smsArray.length} SMS campaigns`);

      // Return with all available fields from Mautic API
      return smsArray.map(sms => ({
        id: sms.id,
        name: sms.name,
        category: sms.category || null,
        sentCount: sms.sentCount || 0,
        language: sms.language || null,
        message: sms.message || null,
        createdBy: sms.createdBy || null,
        createdByUser: sms.createdByUser || null,
        dateAdded: sms.dateAdded || null,
        dateModified: sms.dateModified || null
      }));
    } catch (error) {
      logger.error(`Failed to fetch SMS campaigns:`, { error: error.message });
      throw error;
    }
  }

  /**
   * Transform raw Mautic SMS stats into database-ready format
   * Enriches with mobile numbers and replies for backfilling
   * @param {Array} rawStats - Raw stats from Mautic API
   * @param {number} mauticSmsId - Mautic SMS campaign ID
   * @param {number} localSmsId - Local SMS ID
   * @param {Map} mobileMap - Map of leadId to mobile number
   * @param {Map} repliesMap - Map of leadId to reply data
   * @returns {Array} Transformed stats ready for database insertion
   */
  async transformSmsStatsForDb(rawStats, mauticSmsId, localSmsId, mobileMap = new Map(), repliesMap = new Map(), campaignMessage) {
    const transformedStats = [];

    for (const stat of rawStats) {
      try {
        // Handle different field name formats from Mautic API
        const leadId = stat.lead_id || stat.leadId || stat.contact_id || stat.contactId;
        const dateSent = stat.date_sent || stat.dateSent || stat.sent_date || stat.sentDate;
        const isFailed = stat.is_failed || stat.isFailed || stat.failed || '0';

        if (!leadId) {
          console.warn(`   ⚠️  Skipping stat with no lead ID`);
          continue;
        }

        // Get mobile number from map
        const mobile = mobileMap.get(parseInt(leadId)) || null;

        // Get reply data from map
        const replyData = repliesMap.get(parseInt(leadId)) || {};
        const replyText = replyData.reply || null;
        const replyCategory = replyText && replyText.toUpperCase().includes('STOP') ? 'Stop' : (replyText ? 'Other' : null);
        const repliedAt = replyData.dateAdded ? new Date(replyData.dateAdded) : null;

        transformedStats.push({
          smsId: localSmsId,
          mauticSmsId: mauticSmsId,
          leadId: parseInt(leadId),
          dateSent: dateSent ? new Date(dateSent) : null,
          isFailed: String(isFailed),
          mobile: mobile,
          messageText: campaignMessage, // Common campaign SMS message sent to all contacts
          replyText: replyText,
          replyCategory: replyCategory,
          repliedAt: repliedAt
        });
      } catch (err) {
        console.warn(`   ⚠️  Error transforming stat:`, err.message);
      }
    }

    return transformedStats;
  }

  /**
   * Fetch the common SMS message sent to all leads of the SMS campaign
   * The SMS message sent to first contact is same for all contacts accross the campaign
   * @param {Object} client - Client configuration
   * @param {number} mauticSmsId - mautic SMS campaign ID
   * @param {number} firstLeadId - lead_id of the first lead of the SMS campaign
   */
  async fetchCampaignMessage(client, mauticSmsId, firstLeadId) {
    try {
      const apiClient = this.createClient(client);

      const res = await apiClient.get(`/contacts/${firstLeadId}/activity`);

      const events = res.data?.events || [];

      const smsSentEvents = events.filter(e => e.event === 'sms.sent') || [];

      // filter sms.sent events sent to this contact from this SMS campaign only
      const filteredEvents = smsSentEvents.filter(smsSent => smsSent.details?.stat?.sms_id?.toString() === mauticSmsId.toString()) || [];

      const smsMessages = filteredEvents.map(smsSent =>
        smsSent.details?.stat?.message || ""
      );

      return smsMessages.find(smsMessage => smsMessage.trim() !== "") || ""; // return one message even if there are multiple messages

    } catch (err) {
      logger.error(`   ❌ Error fetching common SMS message: ${err.message}`);
    }
  }

  /**
   * Fetch SMS delivery statistics for a specific campaign and store in database
   * Uses chunked fetching to handle large datasets
   * @param {Object} client - Client configuration
   * @param {number} localSmsId - Local SMS ID from mautic_sms table
   * @param {number} mauticSmsId - Mautic SMS campaign ID
   * @param {Object} campaignLeads - Map containing all leads of the campaign
   * @param {Object} mobileMap - Map containing mobile numbers of all leads
   * @param {Object} repliesMap - Map containing replies by all leads
   * @returns {Promise<Object>} SMS stats storage results
   */
  async fetchAndStoreSmsStats(client, localSmsId, mauticSmsId, campaignLeads, mobileMap, repliesMap, forceFull = false) {
    try {
      console.log("CAMPAIGN LEADS GOT", campaignLeads);
      
      logger.info(`📊 Fetching SMS stats for campaign ${mauticSmsId}${forceFull ? ' [FORCE FULL]' : ''}`);

      // Import SMS stats page manager for safe resumption
      const { default: smsPageManager } = await import('./sms/services/smsStatsPageManager.js');

      // ✅ Check if we already have stats for this campaign (incremental sync)
      if (!forceFull) {
        const existingCount = await prisma.mauticSmsStat.count({
          where: { mauticSmsId: mauticSmsId }
        });

        if (existingCount > 0) {
          logger.info(`   ⏭️  Skipping - ${existingCount} stats already synced`);
          return {
            created: 0,
            skipped: existingCount,
            total: existingCount,
            message: 'Already synced'
          };
        }
      }

      // 🔄 Resume from orphaned pages if process was interrupted
      const orphanedPages = smsPageManager.recoverOrphanedPages();
      let totalCreated = 0;
      let totalSkipped = 0;

      if (orphanedPages.length > 0) {
        logger.info(`\n🔄 RESUMING: ${orphanedPages.length} orphaned pages...`);

        const { default: smsService } = await import('./sms/services/smsService.js');

        for (const orphaned of orphanedPages) {
          try {
            // Orphaned pages contain pre-transformed data
            const storeResult = await smsService.storeTransformedSmsStats(orphaned.data);

            totalCreated += storeResult.created || 0;
            totalSkipped += storeResult.skipped || 0;

            // Don't delete orphaned page after successful processing (keep for later, do not delete)
            // smsPageManager.deletePage(orphaned.pageNumber);

          } catch (e) {
            logger.error(`   ❌ Failed page ${orphaned.pageNumber}: ${e.message}`);
          }
        }
      }

      const apiClient = this.createClient(client);

      // ✅ STEP 1: FETCH ALL LEAD IDs FOR THIS CAMPAIGN FIRST
      logger.info(`   🔍 Fetching all lead IDs for campaign ${mauticSmsId}...`);
      // const allLeadIds = [];
      // let tempStart = 0;
      // const tempLimit = 5000;
      // let hasMoreLeads = true;
      // const campaignLeads = allLeads.filter(lead => lead.sms_id?.toString() === mauticSmsId.toString());

      const campaignLeadIds = campaignLeads.map(lead => lead.lead_id);

      logger.info(`   ✅ Found ${campaignLeadIds.length} total lead IDs for this campaign`);

      let campaignMessage = "";

      if (campaignLeadIds.length > 0) {
        logger.info(`   📱 Fetching message for ${campaignLeadIds.length} leads...`);
        try {
          // mobileMap = await this.fetchMobileNumbersBulk(client, allLeadIds);
          // repliesMap = await this.fetchSmsRepliesBulk(client, allLeadIds);
          const firstLeadId = parseInt(campaignLeadIds[0]);
          campaignMessage = await this.fetchCampaignMessage(client, mauticSmsId, firstLeadId);
          logger.info(`   ✅ Bulk fetch complete: ${mobileMap.size} mobiles, ${repliesMap.size} replies`);
        } catch (bulkErr) {
          logger.warn(`   ⚠️  Bulk fetch failed: ${bulkErr.message}`);
        }
      }

      let allStats = [];
      let pageNumber = orphanedPages.length > 0 ? Math.max(...orphanedPages.map(p => p.pageNumber)) + 1 : 1;
      // let start = 0;
      // const limit = 5000;
      // let hasMore = true;
      // let fetchAttempts = 0;
      // const maxAttempts = 100;

      // ✅ TRANSFORM STATS TO DB FORMAT (with mobile and replies)
      const transformedStats = await this.transformSmsStatsForDb(campaignLeads, mauticSmsId, localSmsId, mobileMap, repliesMap, campaignMessage);

      // 💾 SAVE TRANSFORMED DATA TO DISK (not raw Mautic response)
      const saveSuccess = smsPageManager.savePage(pageNumber, transformedStats);

      // 📝 INSERT INTO DATABASE (use transformed  data)
      const { default: smsService } = await import('./sms/services/smsService.js');
      const storeResult = await smsService.storeTransformedSmsStats(transformedStats);

      totalCreated += storeResult.created || 0;
      totalSkipped += storeResult.skipped || 0;

      allStats.push(...campaignLeads);

      if (allStats.length === 0 && orphanedPages.length === 0) {
        return { created: 0, skipped: 0, total: 0 };
      }

      return {
        created: totalCreated,
        skipped: totalSkipped,
        total: totalCreated + totalSkipped
      };

    } catch (error) {
      logger.error(`❌ Failed to fetch SMS stats for campaign ${mauticSmsId}:`, error.message);
      return { created: 0, skipped: 0, total: 0, error: error.message };
    }
  }

  /**
   * Fetch contact SMS activity (on-demand, no storage)
   * @param {Object} client - Client configuration
   * @param {number} contactId - Mautic contact ID
   * @param {number} smsId - Optional SMS campaign filter
   * @returns {Promise<Array>} SMS activity events
   */
  async fetchContactSmsActivity(client, contactId, smsId = null) {
    try {
      logger.info(`Fetching SMS activity for contact ${contactId}`);
      const apiClient = this.createClient(client);

      const response = await this.retryWithBackoff(() =>
        apiClient.get(`/contacts/${contactId}/activity`, {
          params: { limit: 9999 }
        })
      );

      const events = response.data?.events || [];

      // Filter SMS-related events
      let smsEvents = events.filter(e =>
        e.event === 'sms.sent' || e.event === 'sms_reply'
      );

      // Filter by specific SMS campaign if provided
      if (smsId) {
        smsEvents = smsEvents.filter(e =>
          e.details?.sms?.id === smsId || e.sms?.id === smsId
        );
      }

      logger.info(`Found ${smsEvents.length} SMS events for contact ${contactId}`);
      return smsEvents;
    } catch (error) {
      logger.error(`Failed to fetch SMS activity for contact ${contactId}:`, { error: error.message });
      return [];
    }
  }

  /**
   * Fetch contact details including mobile number
   * @param {Object} client - Client configuration
   * @param {number} leadId - Mautic lead/contact ID
   * @returns {Promise<Object>} Contact details with mobile number
   */
  async fetchContactDetails(client, leadId) {
    try {
      const apiClient = this.createClient(client);

      const response = await this.retryWithBackoff(() =>
        apiClient.get(`/contacts/${leadId}`)
      );

      const fields = response.data?.contact?.fields?.all || {};
      return {
        lead_id: leadId,
        firstname: fields.firstname || null,
        lastname: fields.lastname || null,
        mobile: fields.mobile || null,
        email: fields.email || null
      };
    } catch (error) {
      const code = error.response?.status || error.code || error.message;
      logger.warn(`Failed to fetch contact ${leadId}: ${code}`);
      return { lead_id: leadId, error: true, mobile: null };
    }
  }

  /**
   * ✅ NEW: Fetch mobile numbers in BULK (parallel) for specific lead IDs
   * Fetches all contacts with mobiles in parallel, filters to requested leads
   * Much faster than sequential per-contact fetches
   * @param {Object} client - Mautic client
   * @param {Array<number>} leadIds - Array of lead IDs to fetch mobiles for
   * @returns {Promise<Map>} Map of leadId -> mobile number
   */
  async fetchMobileNumbersBulk(client, leadIds) {
    try {
      const uniqueLeadIds = new Set(leadIds.map(id => parseInt(id)).filter(id => id > 0));

      if (uniqueLeadIds.size === 0) {
        logger.warn(`   ⚠️  No valid lead IDs provided for bulk mobile fetch`);
        return new Map();
      }

      logger.info(`📱 Fetching mobile numbers in BULK (parallel) for ${uniqueLeadIds.size} leads...`);

      const apiClient = this.createClient(client);
      const mobileMap = new Map();

      // STEP 1: Get total contact count (first request)
      const firstReq = await this.retryWithBackoff(() =>
        apiClient.get('/contacts', {
          params: {
            limit: 1,
            search: '!is:anonymous'
          }
        })
      );

      const total = firstReq.data?.total || 0;
      if (total === 0) {
        logger.warn(`   ⚠️  No contacts found in Mautic`);
        return new Map();
      }

      const pageSize = 500;
      const totalPages = Math.ceil(total / pageSize);
      logger.info(`   📊 Total contacts: ${total} records, fetching in ${totalPages} pages (${pageSize} per page)`);

      // STEP 2: Fetch all pages in parallel
      const results = new Array(totalPages);
      let activeRequests = 0;
      let finishedPages = 0;
      let currentPageIndex = 0;

      await new Promise((resolve, reject) => {
        const scheduleNextRequest = () => {
          while (activeRequests < 50 && currentPageIndex < totalPages) {
            const pageIndex = currentPageIndex++;
            const start = pageIndex * pageSize;
            activeRequests++;

            const url = `/contacts?start=${start}&limit=${pageSize}&search=!is:anonymous`;

            this.retryWithBackoff(() => apiClient.get(url))
              .then(res => {
                results[pageIndex] = res.data?.contacts || {};
                activeRequests--;
                finishedPages++;

                // Show progress
                const progress = ((finishedPages / totalPages) * 100).toFixed(1);
                process.stdout.write(`\r   ⚡ Progress: ${progress}% (${finishedPages}/${totalPages})`);

                if (finishedPages === totalPages) {
                  console.log();
                  resolve();
                } else {
                  scheduleNextRequest();
                }
              })
              .catch(err => {
                logger.error(`   ❌ Failed to fetch page ${pageIndex}: ${err.message}`);
                activeRequests--;
                scheduleNextRequest();
              });
          }
        };

        scheduleNextRequest();
      });

      // STEP 3: Extract mobiles from fetched contacts
      let totalProcessed = 0;
      let foundCount = 0;

      for (const contactsObj of results) {
        if (!contactsObj || typeof contactsObj !== 'object') continue;

        for (const [contactId, contact] of Object.entries(contactsObj)) {
          const leadId = parseInt(contactId);
          totalProcessed++;

          // Only process if this lead was requested
          if (!uniqueLeadIds.has(leadId)) continue;

          // Extract mobile from multiple possible field paths
          let mobile = '';
          const allMobile = contact.fields?.all?.mobile;
          const coreMobile = contact.fields?.core?.mobile;

          if (allMobile && typeof allMobile === 'object' && 'value' in allMobile) {
            mobile = allMobile.value || '';
          } else if (coreMobile && typeof coreMobile === 'object' && 'value' in coreMobile) {
            mobile = coreMobile.value || '';
          } else if (typeof allMobile === 'string') {
            mobile = allMobile;
          } else if (typeof coreMobile === 'string') {
            mobile = coreMobile;
          }

          if (mobile && mobile.trim()) {
            mobileMap.set(leadId, mobile.trim());
            foundCount++;
          }
        }
      }

      logger.info(`✅ Bulk mobile fetch complete: Found ${foundCount}/${uniqueLeadIds.size} mobiles (scanned ${totalProcessed} contacts)`);
      return mobileMap;

    } catch (error) {
      logger.error(`Failed to fetch mobile numbers in bulk:`, error.message);
      return new Map();
    }
  }

  /**
   * ✅ NEW: Fetch SMS replies in BULK (parallel) for specific lead IDs
   * @param {Object} client - Mautic client
   * @param {Array<number>} leadIds - Array of lead IDs to fetch replies for
   * @returns {Promise<Map>} Map of leadId -> {reply, dateAdded}
   */
  async fetchSmsRepliesBulk(client, leadIds) {
    try {
      const uniqueLeadIds = new Set(leadIds.map(id => parseInt(id)).filter(id => id > 0));

      if (uniqueLeadIds.size === 0) {
        logger.warn(`   ⚠️  No valid lead IDs provided for bulk reply fetch`);
        return new Map();
      }

      logger.info(`💬 Fetching SMS replies in BULK (parallel) for ${uniqueLeadIds.size} leads...`);

      const apiClient = this.createClient(client);
      const repliesMap = new Map();

      // STEP 1: Get total reply count (first request)
      const firstReq = await this.retryWithBackoff(() =>
        apiClient.get('/stats/lead_event_log', {
          params: {
            'where[0][col]': 'action',
            'where[0][expr]': 'eq',
            'where[0][val]': 'reply',
            limit: 1
          }
        })
      );

      const total = firstReq.data?.total || 0;
      if (total === 0) {
        logger.warn(`   ⚠️  No SMS replies found`);
        return new Map();
      }

      const pageSize = 500;
      const totalPages = Math.ceil(total / pageSize);
      logger.info(`   📊 Total replies: ${total} records, fetching in ${totalPages} pages`);

      // STEP 2: Fetch all pages in parallel
      const results = new Array(totalPages);
      let activeRequests = 0;
      let finishedPages = 0;
      let currentPageIndex = 0;

      await new Promise((resolve, reject) => {
        const scheduleNextRequest = () => {
          while (activeRequests < 50 && currentPageIndex < totalPages) {
            const pageIndex = currentPageIndex++;
            const start = pageIndex * pageSize;
            activeRequests++;

            this.retryWithBackoff(() =>
              apiClient.get('/stats/lead_event_log', {
                params: {
                  'where[0][col]': 'action',
                  'where[0][expr]': 'eq',
                  'where[0][val]': 'reply',
                  start,
                  limit: pageSize
                }
              })
            )
              .then(res => {
                results[pageIndex] = res.data?.stats || {};
                activeRequests--;
                finishedPages++;

                // Show progress
                const progress = ((finishedPages / totalPages) * 100).toFixed(1);
                process.stdout.write(`\r   ⚡ Progress: ${progress}% (${finishedPages}/${totalPages})`);

                if (finishedPages === totalPages) {
                  console.log();
                  resolve();
                } else {
                  scheduleNextRequest();
                }
              })
              .catch(err => {
                logger.error(`   ❌ Failed to fetch replies page ${pageIndex}: ${err.message}`);
                activeRequests--;
                scheduleNextRequest();
              });
          }
        };

        scheduleNextRequest();
      });

      // STEP 3: Extract replies from fetched data
      let totalProcessed = 0;
      let foundCount = 0;

      for (const statsObj of results) {
        if (!statsObj || typeof statsObj !== 'object') continue;

        for (const [recordId, stat] of Object.entries(statsObj)) {
          const leadId = parseInt(stat.lead_id || stat.leadId || 0);
          totalProcessed++;

          // Only process if this lead was requested
          if (!uniqueLeadIds.has(leadId)) continue;

          let replyMessage = 'STOP';
          if (stat.properties) {
            try {
              const parsed = typeof stat.properties === 'string'
                ? JSON.parse(stat.properties)
                : stat.properties;
              replyMessage = parsed.message || parsed.body || parsed.text || stat.properties || 'STOP';
            } catch {
              replyMessage = stat.properties;
            }
          }

          if (leadId > 0) {
            repliesMap.set(leadId, {
              reply: String(replyMessage).trim(),
              dateAdded: stat.date_added || stat.dateAdded || new Date().toISOString()
            });
            foundCount++;
          }
        }
      }

      logger.info(`✅ Bulk reply fetch complete: Found ${foundCount}/${uniqueLeadIds.size} replies (scanned ${totalProcessed} events)`);
      return repliesMap;

    } catch (error) {
      logger.error(`Failed to fetch SMS replies in bulk:`, error.message);
      return new Map();
    }
  }

  /**
   * ⚠️ DEPRECATED: Use fetchMobileNumbersBulk() instead for better performance
   * Fetch contact details for multiple leads - SEQUENTIAL processing (SLOW)
   * @param {Object} client - Client configuration
   * @param {Array<number>} leadIds - Array of lead IDs
   * @returns {Promise<Map>} Map of leadId -> mobile number
   */
  async fetchMobileNumbers(client, leadIds) {
    try {
      const uniqueLeadIds = [...new Set(leadIds)];

      logger.info(`⚠️  DEPRECATED: Using sequential mobile fetch (slow) - should use fetchMobileNumbersBulk() instead`);
      logger.info(`Fetching mobile numbers for ${uniqueLeadIds.length} unique leads (sequential)...`);

      const mobileMap = new Map();

      for (let i = 0; i < uniqueLeadIds.length; i++) {
        const leadId = uniqueLeadIds[i];
        const contact = await this.fetchContactDetails(client, leadId);
        mobileMap.set(leadId, contact.mobile);

        // Log progress every 50 leads
        if ((i + 1) % 50 === 0 || i + 1 === uniqueLeadIds.length) {
          logger.info(`   Processed ${i + 1}/${uniqueLeadIds.length} leads...`);
        }
      }

      const withMobile = Array.from(mobileMap.values()).filter(m => m).length;
      logger.info(`✅ Fetched ${withMobile} mobile numbers (sequential)`);
      return mobileMap;
    } catch (error) {
      logger.error(`Failed to fetch mobile numbers:`, error.message);
      return new Map();
    }
  }
}

export default new MauticAPIService();