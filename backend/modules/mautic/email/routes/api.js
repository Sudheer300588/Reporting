import logger from '../../../../utils/logger.js';
import express from "express";
import mauticAPI from "../../mauticAPI.js";
import dataService from "../services/dataService.js";
import reportJsonImportService from "../services/reportJsonImportService.js";
import statsService from "../services/statsService.js";
import smsService from "../../sms/services/smsService.js";
import MauticSchedulerService from "../../schedulerService.js";
import encryptionService from "../../encryption.js";
import prisma from "../../../../prisma/client.js";
import {
  notifyMauticSyncCompleted,
  notifyMauticSyncFailed,
} from "../../../../utils/emailHelper.js";
import DropCowboyDataService from "../../../dropCowboy/services/dataService.js";
import DropCowboyScheduler from "../../../dropCowboy/services/schedulerService.js";
import { authenticate, hasFullAccess, getAccessibleClientIds } from '../../../../middleware/auth.js';
import smsClientRoutes from '../../sms/routes/smsClient.js';

const router = express.Router();
const schedulerService = new MauticSchedulerService();

// SMS Client routes
router.use('/', smsClientRoutes);

// Track ongoing sync operations
let isSyncInProgress = false;
let currentSyncStartTime = null;
let currentSyncType = null; // 'all' or specific clientId

// ============================================
// CLIENT MANAGEMENT ROUTES
// ============================================

/**
 * GET /api/mautic/clients
 * Get all Autovation Clients
 */
router.get("/clients", async (req, res) => {
  try {
    const clients = await dataService.getClients();

    // Remove encrypted passwords from response
    const sanitizedClients = clients.map((client) => ({
      ...client,
      password: undefined,
    }));

    res.json({
      success: true,
      data: sanitizedClients,
    });
  } catch (error) {
    logger.error("Error fetching clients:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch clients",
      error: error.message,
    });
  }
});

// Get emails for a specific client with optional date filtering
router.get("/clients/:clientId/emails", async (req, res) => {
  try {
    const { clientId } = req.params;
    const { fromDate, toDate } = req.query;

    // First, get all emails for this client
    const emails = await prisma.mauticEmail.findMany({
      where: { clientId: parseInt(clientId) },
      select: {
        id: true,
        mauticEmailId: true,
        name: true,
        subject: true,
        emailType: true,
        dateAdded: true,
        sentCount: true,
        readCount: true,
        clickedCount: true,
        unsubscribed: true,
        bounced: true,
        readRate: true,
        clickRate: true,
        unsubscribeRate: true,
        isPublished: true,
        publishUp: true,
        publishDown: true,
      },
    });

    // Attach unique click counts (from MauticClickTrackable) to emails when available
    try {
      const mauticIds = emails.map(e => parseInt(e.mauticEmailId || '0')).filter(Boolean);
      if (mauticIds.length > 0) {
        const clickSums = await prisma.mauticClickTrackable.groupBy({
          by: ['channelId'],
          where: { channelId: { in: mauticIds }, clientId: parseInt(clientId) },
          _sum: { uniqueHits: true, hits: true }
        });
        const clickMap = new Map(clickSums.map(c => [c.channelId, c._sum]));
        emails.forEach(email => {
          const mid = parseInt(email.mauticEmailId || '0');
          const sums = clickMap.get(mid) || { uniqueHits: 0, hits: 0 };
          email.uniqueClicks = sums.uniqueHits || 0;
          email.clickHits = sums.hits || 0;
        });
      }
    } catch (e) {
      // ignore if table/model missing or grouping fails
      logger.warn('Failed to attach unique click counts to emails (non-fatal):', e.message || e);
    }

    // If date filter is applied, we need to calculate filtered stats
    if (fromDate || toDate) {
      const reportWhere = { clientId: parseInt(clientId) };

      if (fromDate || toDate) {
        reportWhere.dateSent = {};
        if (fromDate) {
          const from = new Date(fromDate);
          from.setHours(0, 0, 0, 0);
          reportWhere.dateSent.gte = from;
        }
        if (toDate) {
          const to = new Date(toDate);
          to.setHours(23, 59, 59, 999);
          reportWhere.dateSent.lte = to;
        }
      }

      // Get filtered report counts per email
      const reportStats = await prisma.mauticEmailReport.groupBy({
        by: ["eId"],
        where: reportWhere,
        _count: {
          id: true,
        },
        _sum: {
          id: true,
        },
      });

      // Get read counts
      const readStats = await prisma.mauticEmailReport.groupBy({
        by: ["eId"],
        where: {
          ...reportWhere,
          dateRead: { not: null },
        },
        _count: {
          id: true,
        },
      });

      // Create lookup maps
      const sentMap = new Map(
        reportStats.map((s) => [String(s.eId), s._count.id])
      );
      const readMap = new Map(
        readStats.map((s) => [String(s.eId), s._count.id])
      );

      // Enhance emails with filtered stats and date filter flag
      const enhancedEmails = emails.map((email) => {
        const emailId = String(email.mauticEmailId);
        const filteredSent = sentMap.get(emailId) || 0;
        const filteredRead = readMap.get(emailId) || 0;

        return {
          ...email,
          filteredSentCount: filteredSent,
          filteredReadCount: filteredRead,
          hasDateFilter: true,
        };
      });

      res.json({ success: true, data: enhancedEmails });
    } else {
      // No date filter - return original stats
      res.json({ success: true, data: emails });
    }
  } catch (error) {
    logger.error(error);
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to fetch emails",
        error: error.message,
      });
  }
});

// Get segments for a specific client
// Get segments for a specific client with contact counts, sorted by contactCount descending
router.get("/clients/:clientId/segments", async (req, res) => {
  try {
    const { clientId } = req.params;
    const segments = await prisma.mauticSegment.findMany({
      where: { clientId: parseInt(clientId) },
      orderBy: { contactCount: 'desc' }, // Sort by contact count, highest first
    });

    // Calculate total contacts across all segments
    const totalContacts = segments.reduce((sum, segment) => sum + (segment.contactCount || 0), 0);

    res.json({
      success: true,
      data: segments,
      totalContacts: totalContacts,
      segmentCount: segments.length
    });
  } catch (error) {
    logger.error(error);
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to fetch segments",
        error: error.message,
      });
  }
});

// Get campaigns for a specific client
router.get("/clients/:clientId/campaigns", async (req, res) => {
  try {
    const { clientId } = req.params;
    const campaigns = await prisma.mauticCampaign.findMany({
      where: { clientId: parseInt(clientId) },
    });
    res.json({ success: true, data: campaigns });
  } catch (error) {
    logger.error(error);
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to fetch campaigns",
        error: error.message,
      });
  }
});

// Get SMS campaigns for a specific Mautic client
router.get("/clients/:clientId/sms", async (req, res) => {
  try {
    const { clientId } = req.params;

    // Get the Mautic client so we can match by origin URL as well.
    const mauticClient = await prisma.mauticClient.findUnique({
      where: { id: parseInt(clientId) },
      include: { client: true }
    });

    if (!mauticClient) {
      return res.json({ success: true, data: [] });
    }

    const smsCampaigns = await prisma.mauticSms.findMany({
      where: { clientId: mauticClient.id },
      orderBy: { sentCount: 'desc' }
    });

    res.json({ success: true, data: smsCampaigns });
  } catch (error) {
    logger.error(error);
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to fetch SMS campaigns",
        error: error.message,
      });
  }
});

// OVERALL: Get overall SMS statistics across all active clients (optimized single query)
router.get("/clients/sms/overall-stats", async (req, res) => {
  try {
    // IMPORTANT:
    // The Services → SMS screen expects *all* SMS campaigns currently stored.
    // Do NOT filter by linked/active Mautic client here, because campaigns may be:
    // - Unmatched (stored under sms-only or clientId NULL)
    // - Sourced via SmsClient credentials
    // Filtering causes totals to swing (e.g., 58 → 55 → 9) depending on mappings.

    // find existing mautic clients first
    const mauticClients = await prisma.mauticClient.findMany({
      where: { reportId: { not: 'sms-only' } },
      select: { id: true }
    });

    const mauticClientsIds = mauticClients.map(mc => mc.id);

    const smsCampaigns = await prisma.mauticSms.findMany({
      where: { clientId: { in: mauticClientsIds } },
      orderBy: { sentCount: 'desc' }
    });

    // Calculate aggregated stats
    const stats = {
      totalCampaigns: smsCampaigns.length,
      totalSent: smsCampaigns.reduce((sum, sms) => sum + (sms.sentCount || 0), 0),
      activeCampaigns: smsCampaigns.filter(sms => sms.sentCount > 0).length
    };

    logger.debug(`✅ Overall SMS stats: ${stats.totalCampaigns} campaigns, ${stats.totalSent} sent, ${stats.activeCampaigns} active`);

    res.json({
      success: true,
      stats,
      data: smsCampaigns
    });
  } catch (error) {
    logger.error('Error fetching overall SMS stats:', error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch overall SMS statistics",
      error: error.message,
    });
  }
});

// BULK: Get SMS campaigns for multiple clients (avoids N+1 queries)
router.post("/clients/sms/bulk", async (req, res) => {
  try {
    const { clientIds } = req.body;

    if (!clientIds || !Array.isArray(clientIds) || clientIds.length === 0) {
      return res.json({ success: true, data: [] });
    }

    const validClientIds = clientIds.map(id => parseInt(id)).filter(id => !isNaN(id));

    // Get all Mautic clients so we can match by clientId and origin URL
    const mauticClients = await prisma.mauticClient.findMany({
      where: { id: { in: validClientIds } },
      include: { client: true }
    });

    // IMPORTANT: Match ONLY by clientId.
    // originMauticUrl is a Mautic instance identifier shared by multiple clients,
    // so using it here can leak campaigns across clients.
    const orConditions = [{ clientId: { in: validClientIds } }];

    // Single query to get all SMS campaigns matching any condition
    const smsCampaigns = await prisma.mauticSms.findMany({
      where: {
        OR: orConditions
      },
      orderBy: { sentCount: 'desc' }
    });

    logger.debug(`✅ Bulk SMS fetch: ${smsCampaigns.length} campaigns for ${clientIds.length} clients`);
    res.json({ success: true, data: smsCampaigns });
  } catch (error) {
    logger.error('Error in bulk SMS fetch:', error);
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to fetch SMS campaigns",
        error: error.message,
      });
  }
});

// Get email reports for a specific client
router.get("/clients/:clientId/email-reports", async (req, res) => {
  try {
    const { clientId } = req.params;
    const { fromDate, toDate } = req.query;

    // Only fetch if date filter is applied (avoid heavy queries)
    if (!fromDate && !toDate) {
      return res.json({
        success: true,
        data: [],
        pagination: { total: 0 },
      });
    }

    const where = { clientId: parseInt(clientId) };

    // Add date range filter on dateSent
    if (fromDate || toDate) {
      where.dateSent = {};
      if (fromDate) {
        const from = new Date(fromDate);
        from.setHours(0, 0, 0, 0);
        where.dateSent.gte = from;
      }
      if (toDate) {
        const to = new Date(toDate);
        to.setHours(23, 59, 59, 999);
        where.dateSent.lte = to;
      }
    }

    // Use raw MauticEmailReport table for accurate date filtering
    const aggregated = await prisma.mauticEmailReport.groupBy({
      by: ["eId"],
      where,
      _count: {
        eId: true, // total records (sends)
        dateRead: true, // number of rows with dateRead not null
      },
    });

    // Get email metadata
    const uniqueEids = aggregated.map((a) => a.eId).filter(Boolean);
    const emailMeta = await prisma.mauticEmailReport.findMany({
      where: { eId: { in: uniqueEids } },
      distinct: ["eId"],
      select: { eId: true, subject: true, emailAddress: true },
    });

    const metaMap = new Map(emailMeta.map((e) => [e.eId, e]));

    const normalized = aggregated.map((a) => ({
      eId: a.eId,
      sentCount: a._count.eId || 0,
      readCount: a._count.dateRead || 0,
      subject: metaMap.get(a.eId)?.subject || null,
      emailAddress: metaMap.get(a.eId)?.emailAddress || null,
    }));

    res.json({
      success: true,
      data: normalized,
      totalEmails: normalized.length,
    });
  } catch (error) {
    logger.error("❌ Error fetching email reports:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch email reports",
      error: error.message,
    });
  }
});

// ⚡ NEW: Get aggregated email reports (90%+ storage savings)
router.get("/clients/:clientId/reports/aggregated", async (req, res) => {
  try {
    const { clientId } = req.params;
    const { fromDate, toDate, eId } = req.query;

    const { default: aggregatedReportService } = await import('../services/aggregatedReportService.js');

    const filters = {};
    if (fromDate) filters.fromDate = fromDate;
    if (toDate) filters.toDate = toDate;
    if (eId) filters.eId = eId;

    const reports = await aggregatedReportService.getAggregatedReports(
      parseInt(clientId),
      filters
    );

    res.json({
      success: true,
      data: reports,
      count: reports.length
    });
  } catch (error) {
    logger.error("❌ Error fetching aggregated reports:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch aggregated reports",
      error: error.message
    });
  }
});

// ⚡ NEW: Get aggregated report summary
router.get("/clients/:clientId/reports/aggregated/summary", async (req, res) => {
  try {
    const { clientId } = req.params;
    const { fromDate, toDate } = req.query;

    const { default: aggregatedReportService } = await import('../services/aggregatedReportService.js');

    const filters = {};
    if (fromDate) filters.fromDate = fromDate;
    if (toDate) filters.toDate = toDate;

    const summary = await aggregatedReportService.getAggregatedSummary(
      parseInt(clientId),
      filters
    );

    res.json({
      success: true,
      data: summary
    });
  } catch (error) {
    logger.error("❌ Error fetching aggregated summary:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch aggregated summary",
      error: error.message
    });
  }
});

/**
 * POST /api/mautic/clients
 * Create a new Mautic client
 */
router.post("/clients", async (req, res) => {
  try {
    let {
      name,
      mauticUrl,
      username,
      password,
      reportId,
      assignToManager,
      assignToEmployees,
      fromDate,
      toDate,
      limit,
    } = req.body;

    // Validate required fields
    if (!name || !mauticUrl || !username || !password || !reportId) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields or reportId is invalid",
      });
    }

    // Normalize Mautic URL
    mauticUrl = mauticUrl.trim();
    if (!mauticUrl.startsWith("http://") && !mauticUrl.startsWith("https://")) {
      mauticUrl = "https://" + mauticUrl;
    }
    mauticUrl = mauticUrl.replace(/\/$/, "");

    // Test connection before saving
    const connectionTest = await mauticAPI.testConnection({
      mauticUrl,
      username,
      password,
    });

    if (!connectionTest.success) {
      return res.status(400).json({
        success: false,
        message: "Connection test failed: " + connectionTest.message,
      });
    }

    // Encrypt password
    const encryptedPassword = encryptionService.encrypt(password);

    // Auto-create or find corresponding Client
    let mainClientId = null;
    try {
      // Check if client with this name already exists
      let mainClient = await prisma.client.findFirst({
        where: {
          name: name,
          clientType: "general",
        },
      });

      if (!mainClient) {
        // Create new client - get superadmin user
        const systemUser = await prisma.user.findFirst({
          where: { role: "superadmin" },
        });

        if (systemUser) {
          mainClient = await prisma.client.create({
            data: {
              name: name,
              clientType: "mautic",
              description: `Autovation instance: ${mauticUrl}`,
              isActive: true,
              createdById: systemUser.id,
            },
          });
          logger.debug(
            `✨ Auto-created client: ${name} (ID: ${mainClient.id}) for Mautic service`
          );

          // Handle assignments if provided
          const assignedById = systemUser.id;
          const assignmentPromises = [];

          // Assign to manager if provided
          if (assignToManager) {
            assignmentPromises.push(
              prisma.clientAssignment
                .create({
                  data: {
                    clientId: mainClient.id,
                    userId: parseInt(assignToManager),
                    assignedById: assignedById,
                  },
                })
                .catch((err) =>
                  logger.error("Error assigning to manager:", err)
                )
            );
          }

          // Assign to employees if provided
          if (
            assignToEmployees &&
            Array.isArray(assignToEmployees) &&
            assignToEmployees.length > 0
          ) {
            assignToEmployees.forEach((empId) => {
              assignmentPromises.push(
                prisma.clientAssignment
                  .create({
                    data: {
                      clientId: mainClient.id,
                      userId: parseInt(empId),
                      assignedById: assignedById,
                    },
                  })
                  .catch((err) =>
                    logger.error(`Error assigning to employee ${empId}:`, err)
                  )
              );
            });
          }

          // Execute all assignments
          if (assignmentPromises.length > 0) {
            await Promise.all(assignmentPromises);
            logger.debug(
              `✅ Created ${assignmentPromises.length} client assignments`
            );
          }
        }
      }

      mainClientId = mainClient?.id;
    } catch (clientError) {
      logger.error("Error auto-creating client:", clientError);
      // Continue even if client creation fails
    }

    // Check if Mautic client already exists (avoid duplicate name constraint)
    let existingMauticClient = await prisma.mauticClient.findFirst({
      where: { name: name },
    });

    let client;
    if (existingMauticClient) {
      // Update existing client instead of creating new one
      client = await prisma.mauticClient.update({
        where: { id: existingMauticClient.id },
        data: {
          mauticUrl,
          username,
          password: encryptedPassword,
          reportId,
          isActive: true,
          clientId: mainClientId,
        },
      });
      logger.debug(
        `🔄 Updated existing Mautic client: ${name} (ID: ${client.id})`
      );
    } else {
      // Create new Mautic client
      client = await prisma.mauticClient.create({
        data: {
          name,
          mauticUrl,
          username,
          password: encryptedPassword,
          reportId,
          isActive: true,
          clientId: mainClientId,
        },
      });
      logger.debug(`✨ Created new Mautic client: ${name} (ID: ${client.id})`);

      // ⚡ FAST INITIAL METADATA FETCH - Fetch lightweight metadata immediately
      // This makes the client visible in UI instantly with basic info
      setImmediate(async () => {
        try {
          logger.debug(`⚡ Starting FAST metadata fetch for ${name}...`);

          // Fetch only lightweight metadata (NO stats, NO reports)
          const [emails, campaigns, segments] = await Promise.all([
            mauticAPI.fetchEmails(client, false), // false = no individual stats
            mauticAPI.fetchCampaigns(client),
            mauticAPI.fetchSegments(client)
          ]);

          logger.debug(`   ✅ Fetched ${emails.length} emails, ${campaigns.length} campaigns, ${segments.length} segments`);

          // Save metadata to DB
          const { default: dataService } = await import('../services/dataService.js');
          await Promise.all([
            dataService.saveEmails(client.id, emails),
            dataService.saveCampaigns(client.id, campaigns),
            dataService.saveSegments(client.id, segments)
          ]);

          // Update client totals
          await prisma.mauticClient.update({
            where: { id: client.id },
            data: {
              totalEmails: emails.length,
              totalCampaigns: campaigns.length,
              totalSegments: segments.length
            }
          });

          logger.debug(`   ✅ Metadata saved to DB for ${name}`);
          logger.debug(`⚡ FAST metadata fetch complete - client is now visible in UI!`);
          logger.debug(`📊 Heavy report data will be fetched during next scheduled sync`);

          // Reassign orphaned SMS that match this client's name prefix (lightweight operation)
          try {
            const reassignedCount = await smsService.reassignOrphanedSms(client.id);
            if (reassignedCount > 0) {
              logger.info(`   ✅ Reassigned ${reassignedCount} SMS campaigns to "${name}"`);
            }
          } catch (reassignError) {
            logger.error(`   ⚠️ Failed to reassign SMS:`, reassignError.message);
          }

        } catch (metaErr) {
          logger.error(`❌ Fast metadata fetch failed for ${name}:`, metaErr.message);
          logger.debug(`   Data will be fetched during next scheduled sync`);
        }
      });

      logger.debug(`✅ Client created. Metadata fetch running in background. Heavy data deferred to sync.`);

      // ✅ AUTO HISTORICAL BACKFILL (email reports + SMS stats) in background
      // This is heavy, so we run it asynchronously and skip already-fetched months.
      const autoBackfillEnabled = String(process.env.MAUTIC_AUTO_BACKFILL_ON_CREATE || 'true') === 'true';
      if (autoBackfillEnabled) {
        setImmediate(async () => {
          try {
            const DEFAULT_START = process.env.MAUTIC_DEFAULT_BACKFILL_START || '2025-01-01';
            const backfillStart = fromDate ? new Date(fromDate) : new Date(DEFAULT_START);
            const backfillEnd = toDate ? new Date(toDate) : new Date();
            const pageLimit = limit || 5000;

            logger.info(`📅 Auto-backfill started for ${client.name} (${backfillStart.toISOString().slice(0, 10)} → ${backfillEnd.toISOString().slice(0, 10)})`);

            function monthsBetween(from, to) {
              const out = [];
              let y = from.getFullYear();
              let m = from.getMonth() + 1;
              const endY = to.getFullYear();
              const endM = to.getMonth() + 1;
              while (y < endY || (y === endY && m <= endM)) {
                out.push({ year: y, month: m });
                if (m === 12) {
                  y++;
                  m = 1;
                } else {
                  m++;
                }
              }
              return out;
            }

            const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
            const PAUSE_MS = parseInt(process.env.MAUTIC_BACKFILL_PAUSE_MS || '2000', 10);

            // 1) Email report backfill (monthwise) for non-SMS-only clients
            if (client.reportId && client.reportId !== 'sms-only') {
              const months = monthsBetween(backfillStart, backfillEnd);
              for (const mm of months) {
                const ym = `${mm.year}-${String(mm.month).padStart(2, '0')}`;

                const existing = await prisma.mauticFetchedMonth.findFirst({
                  where: { clientId: client.id, yearMonth: ym }
                });
                if (existing) {
                  logger.debug(`   ⏭️ Email reports ${ym}: already fetched`);
                  continue;
                }

                const from = `${ym}-01 00:00:00`;
                const lastDay = new Date(mm.year, mm.month, 0).getDate();
                const to = `${ym}-${String(lastDay).padStart(2, '0')} 23:59:59`;

                try {
                  await mauticAPI.fetchHistoricalReports(client, from, to, pageLimit);
                } catch (e) {
                  logger.error(`   ❌ Email reports backfill failed for ${ym}:`, e.message || e);
                }

                await sleep(PAUSE_MS);
              }
            }

            // 2) SMS campaigns + stats backfill (isolated temp pages)
            // Uses sync pipeline but skips the heavy email report fetch.
            try {
              await mauticAPI.syncAllData(client, { skipEmailReports: true });
            } catch (e) {
              logger.error(`   ❌ SMS backfill failed:`, e.message || e);
            }

            logger.info(`✅ Auto-backfill finished for ${client.name}`);
          } catch (e) {
            logger.error(`❌ Auto-backfill crash for ${client.name}:`, e.message || e);
          }
        });
      }
    }

    res.json({
      success: true,
      message:
        "Mautic client created successfully. Metadata is being fetched in background. Historical backfill is running in background." +
        (mainClientId ? " Client linked to main client." : ""),
      data: {
        ...client,
        password: undefined,
      },
    });
  } catch (error) {
    logger.error("Error creating client:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create client",
      error: error.message,
    });
  }
});

/**
 * GET /api/mautic/clients/:id/password
 * Get decrypted password for test connection
 */
router.get("/clients/:id/password", async (req, res) => {
  try {
    const { id } = req.params;

    const client = await prisma.mauticClient.findUnique({
      where: { id: parseInt(id) },
    });

    if (!client) {
      return res.status(404).json({
        success: false,
        message: "Client not found",
      });
    }

    // Decrypt password
    const decryptedPassword = encryptionService.decrypt(client.password);

    res.json({
      success: true,
      data: {
        password: decryptedPassword,
      },
    });
  } catch (error) {
    logger.error("Error fetching client password:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch password",
      error: error.message,
    });
  }
});

/**
 * PUT /api/mautic/clients/:id
 * Update a Mautic client (also supports backfilling historical reports)
 */
router.put("/clients/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, mauticUrl, username, isActive, fromDate, toDate, limit } =
      req.body;

    const { password } = req.body;

    const updateData = {};
    if (name) updateData.name = name;
    if (mauticUrl) updateData.mauticUrl = mauticUrl;
    if (username) updateData.username = username;
    // Only encrypt and update password if a non-empty password is provided
    if (password && password.trim()) updateData.password = encryptionService.encrypt(password);
    if (typeof isActive === "boolean") updateData.isActive = isActive;

    const client = await prisma.mauticClient.update({
      where: { id: parseInt(id) },
      data: updateData,
    });

    // If name was updated and there's a linked Client record, update it too
    if (name && client.clientId) {
      try {
        const updatedClient = await prisma.client.update({
          where: { id: client.clientId },
          data: { name: name }
        });
        logger.info(`✅ Synced Client table name to: ${name} (Client ID: ${client.clientId})`);
      } catch (syncError) {
        logger.error(`⚠️ Failed to sync Client table name for MauticClient ${id}:`, syncError);
      }
    } else if (name && !client.clientId) {
      logger.warn(`⚠️ MauticClient ${id} has no linked Client record (clientId is null)`);
    }

    // If historical date range provided during update, backfill reports
    if (fromDate && toDate) {
      logger.debug(
        `📅 Backfilling historical reports from ${fromDate} to ${toDate}...`
      );
      try {
        const historicalResult = await mauticAPI.fetchHistoricalReports(
          client,
          fromDate,
          toDate,
          limit || 5000
        );
        logger.debug(
          `✅ Historical backfill complete: ${historicalResult.created} reports saved`
        );
      } catch (histError) {
        logger.error(`⚠️ Historical backfill failed:`, histError.message);
      }
    }

    res.json({
      success: true,
      message: "Client updated successfully",
      data: {
        ...client,
        password: undefined,
      },
    });
  } catch (error) {
    logger.error("Error updating client:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update client",
      error: error.message,
    });
  }
});

/**
 * POST /api/mautic/clients/:id/backfill
 * Trigger month-by-month historical backfill for a client
 * Accepts optional JSON body: { fromDate: 'YYYY-MM-DD', toDate: 'YYYY-MM-DD', pageLimit: 5000 }
 */
router.post("/clients/:id/backfill", async (req, res) => {
  try {
    const { id } = req.params;
    const { fromDate, toDate, pageLimit } = req.body || {};

    const client = await prisma.mauticClient.findUnique({
      where: { id: parseInt(id) },
    });
    if (!client)
      return res
        .status(404)
        .json({ success: false, message: "Client not found" });

    // Determine range: provided range or fallback to client.createdAt -> now
    const start = fromDate
      ? new Date(fromDate)
      : client.createdAt
        ? new Date(client.createdAt)
        : new Date(new Date().getFullYear(), 0, 1);
    const end = toDate ? new Date(toDate) : new Date();

    // Respond quickly and run backfill in background
    res.json({
      success: true,
      message: `Backfill started for client ${client.id} from ${start
        .toISOString()
        .slice(0, 10)} to ${end.toISOString().slice(0, 10)}`,
    });

    // Run in background
    (async () => {
      try {
        function monthsBetween(from, to) {
          const out = [];
          let y = from.getFullYear();
          let m = from.getMonth() + 1;
          const endY = to.getFullYear();
          const endM = to.getMonth() + 1;
          while (y < endY || (y === endY && m <= endM)) {
            out.push({ year: y, month: m });
            if (m === 12) {
              y++;
              m = 1;
            } else {
              m++;
            }
          }
          return out;
        }

        // Reverse month list so we fetch newest data first (priority-based syncing)
        const months = monthsBetween(start, end).reverse();
        const PAUSE_MS = parseInt(
          process.env.MAUTIC_BACKFILL_PAUSE_MS || "2000",
          10
        );
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

        for (const mm of months) {
          const year = mm.year;
          const month = mm.month;
          const ym = `${year}-${String(month).padStart(2, "0")}`;

          // Skip if already fetched
          const existing = await prisma.mauticFetchedMonth.findFirst({
            where: { clientId: client.id, yearMonth: ym },
          });
          if (existing) {
            logger.debug(`   ⏭️ Skipping ${ym}, already fetched`);
            continue;
          }

          const from = `${ym}-01 00:00:00`;
          const lastDay = new Date(year, month, 0).getDate();
          let toDay = lastDay;
          // if this is the final month in supplied range, cap by `end`
          if (end.getFullYear() === year && end.getMonth() + 1 === month) {
            toDay = Math.min(toDay, end.getDate());
          }
          const to = `${ym}-${String(toDay).padStart(2, "0")} 23:59:59`;

          try {
            logger.debug(
              `   ▶️ Backfilling ${ym} (${from} → ${to}) for client ${client.id}`
            );
            const r = await mauticAPI.fetchHistoricalReports(
              client,
              from,
              to,
              pageLimit || 5000
            );
            logger.debug(
              `   ✅ ${ym} -> created ${r.created} skipped ${r.skipped}`
            );
          } catch (e) {
            logger.error(
              `   ❌ Failed to fetch ${ym}:`,
              e && e.message ? e.message : String(e)
            );
          }

          try {
            await sleep(PAUSE_MS);
          } catch (e) {
            /* ignore */
          }
        }

        logger.debug(`🔁 Background backfill finished for client ${client.id}`);
      } catch (bgErr) {
        logger.error(
          "Background backfill error:",
          bgErr && bgErr.message ? bgErr.message : String(bgErr)
        );
      }
    })();
  } catch (error) {
    logger.error("Error initiating backfill:", error.message);
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to initiate backfill",
        error: error.message,
      });
  }
});

/**
 * POST /api/mautic/clients/backfill-all
 * Trigger month-by-month historical backfill for ALL non-SMS Mautic clients
 * Body (optional): { fromDate: 'YYYY-MM-DD', toDate: 'YYYY-MM-DD', pageLimit: 5000 }
 *
 * Default range if not provided: from 2025-01-01 to today.
 */
router.post("/clients/backfill-all", async (req, res) => {
  try {
    const { fromDate, toDate, pageLimit } = req.body || {};

    const DEFAULT_START = new Date(2025, 0, 1); // 2025-01-01
    const globalStart = fromDate ? new Date(fromDate) : DEFAULT_START;
    const globalEnd = toDate ? new Date(toDate) : new Date();

    const clients = await prisma.mauticClient.findMany({
      where: {
        reportId: { not: "sms-only" },
      },
      select: {
        id: true,
        name: true,
        createdAt: true,
      },
    });

    res.json({
      success: true,
      message: `Backfill started for ${clients.length} clients from ${globalStart
        .toISOString()
        .slice(0, 10)} to ${globalEnd.toISOString().slice(0, 10)}`,
      clients: clients.map((c) => ({ id: c.id, name: c.name })),
    });

    // Run the heavy work in background
    (async () => {
      try {
        function monthsBetween(from, to) {
          const out = [];
          let y = from.getFullYear();
          let m = from.getMonth() + 1;
          const endY = to.getFullYear();
          const endM = to.getMonth() + 1;
          while (y < endY || (y === endY && m <= endM)) {
            out.push({ year: y, month: m });
            if (m === 12) {
              y++;
              m = 1;
            } else {
              m++;
            }
          }
          return out;
        }

        const PAUSE_MS = parseInt(
          process.env.MAUTIC_BACKFILL_PAUSE_MS || "2000",
          10
        );
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

        for (const client of clients) {
          try {
            const clientStartRaw = client.createdAt
              ? new Date(client.createdAt)
              : globalStart;
            const clientStart = clientStartRaw < globalStart ? globalStart : clientStartRaw;

            const months = monthsBetween(clientStart, globalEnd).reverse();

            logger.debug(
              `▶️ Global backfill: client ${client.id} (${client.name}) from ${clientStart
                .toISOString()
                .slice(0, 10)} to ${globalEnd.toISOString().slice(0, 10)} (${months.length} months)`
            );

            for (const mm of months) {
              const year = mm.year;
              const month = mm.month;
              const ym = `${year}-${String(month).padStart(2, "0")}`;

              // Skip if already fetched for this client
              const existing = await prisma.mauticFetchedMonth.findFirst({
                where: { clientId: client.id, yearMonth: ym },
              });
              if (existing) {
                logger.debug(
                  `   ⏭️ [client ${client.id}] Skipping ${ym}, already fetched`
                );
                continue;
              }

              const from = `${ym}-01 00:00:00`;
              const lastDay = new Date(year, month, 0).getDate();
              let toDay = lastDay;
              // If this is the final month in supplied range, cap by globalEnd
              if (
                globalEnd.getFullYear() === year &&
                globalEnd.getMonth() + 1 === month
              ) {
                toDay = Math.min(toDay, globalEnd.getDate());
              }
              const toStr = `${ym}-${String(toDay).padStart(2, "0")} 23:59:59`;

              try {
                logger.debug(
                  `   ▶️ [client ${client.id}] Backfilling ${ym} (${from} → ${toStr})`
                );
                const r = await mauticAPI.fetchHistoricalReports(
                  client,
                  from,
                  toStr,
                  pageLimit || 5000
                );
                logger.debug(
                  `   ✅ [client ${client.id}] ${ym} -> created ${r.created} skipped ${r.skipped}`
                );
              } catch (e) {
                logger.error(
                  `   ❌ [client ${client.id}] Failed to fetch ${ym}:`,
                  e && e.message ? e.message : String(e)
                );
              }

              try {
                await sleep(PAUSE_MS);
              } catch (e) {
                /* ignore */
              }
            }

            logger.debug(
              `🔁 Global background backfill finished for client ${client.id}`
            );
          } catch (clientErr) {
            logger.error(
              `Global backfill error for client ${client.id}:`,
              clientErr && clientErr.message ? clientErr.message : String(clientErr)
            );
          }
        }
      } catch (bgErr) {
        logger.error(
          "Global backfill (all clients) error:",
          bgErr && bgErr.message ? bgErr.message : String(bgErr)
        );
      }
    })();
  } catch (error) {
    logger.error("Error initiating global backfill:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to initiate global backfill",
      error: error.message,
    });
  }
});

/**
 * DELETE /api/mautic/clients/:id
 * Delete a Mautic client and its associated records
 */
router.delete("/clients/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const clientId = parseInt(id);

    logger.debug(
      `[mautic-api] Received DELETE /clients/${id} request with params:`,
      req.params
    );

    // Ensure client exists
    const existing = await prisma.mauticClient.findUnique({
      where: { id: clientId },
    });
    if (!existing) {
      return res
        .status(404)
        .json({ success: false, message: "Client not found" });
    }

    // Instead of hard-deleting, perform a soft-deactivate to keep data intact
    const updated = await prisma.mauticClient.update({
      where: { id: clientId },
      data: { isActive: false },
    });

    // If linked to a main Client, deactivate that too
    if (updated.clientId) {
      await prisma.client.update({
        where: { id: updated.clientId },
        data: { isActive: false },
      });
      logger.debug(`Deactivated linked main client (ID: ${updated.clientId})`);
    }

    // Log activity (if logActivity is available in this module scope)
    try {
      if (typeof logActivity === "function") {
        await logActivity(
          req.user || null,
          "mautic_client_deactivated",
          "mautic_client",
          clientId,
          `Deactivated mautic client: ${updated.name}`,
          { clientId: updated.id, clientName: updated.name },
          req
        );
      }
    } catch (e) {
      // ignore logging errors
    }

    res.json({
      success: true,
      message: "Mautic client deactivated successfully",
    });
  } catch (error) {
    logger.error("Error deleting mautic client:", error);
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to delete client",
        error: error.message,
      });
  }
});

/**
 * DELETE /api/mautic/clients/:id/permanent
 * Permanently delete a Mautic client and all associated records
 */
router.delete("/clients/:id/permanent", async (req, res) => {
  try {
    const { id } = req.params;
    const clientId = parseInt(id);

    logger.debug(`[mautic-api] Received PERMANENT DELETE /clients/${id}/permanent request`);

    const existing = await prisma.mauticClient.findUnique({
      where: { id: clientId },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Client not found",
      });
    }

    const clientName = existing.name;
    const linkedClientId = existing.clientId;

    // Delete the MauticClient - cascade deletes will handle all related records automatically
    // This is much faster than manual deletion and avoids transaction timeouts
    await prisma.mauticClient.delete({ where: { id: clientId } });

    // Handle linked client cleanup if needed
    if (linkedClientId) {
      const otherMauticLinks = await prisma.mauticClient.count({
        where: { clientId: linkedClientId },
      });
      if (otherMauticLinks === 0) {
        await prisma.dropCowboyCampaign.updateMany({
          where: { clientId: linkedClientId },
          data: { clientId: null },
        });
        await prisma.client.delete({ where: { id: linkedClientId } });
        logger.debug(`Deleted linked main client (ID: ${linkedClientId})`);
      }
    }

    try {
      if (typeof logActivity === "function") {
        await logActivity(
          req.user || null,
          "mautic_client_deleted",
          "mautic_client",
          clientId,
          `Permanently deleted mautic client: ${clientName}`,
          { clientId, clientName },
          req
        );
      }
    } catch (e) {
      // ignore logging errors
    }

    logger.debug(`✓ Permanently deleted mautic client: ${clientName} (ID: ${clientId})`);

    res.json({
      success: true,
      message: `Client "${clientName}" and all associated data permanently deleted`,
    });
  } catch (error) {
    logger.error("Error permanently deleting mautic client:", error);
    res.status(500).json({
      success: false,
      message: "Failed to permanently delete client",
      error: error.message,
    });
  }
});

/**
 * PATCH /api/mautic/clients/:id/toggle
 * Toggle active status of a Mautic client
 */
router.patch("/clients/:id/toggle", async (req, res) => {
  try {
    const { id } = req.params;

    // Get current status
    const currentClient = await prisma.mauticClient.findUnique({
      where: { id: parseInt(id) },
    });

    if (!currentClient) {
      return res.status(404).json({
        success: false,
        message: "Client not found",
      });
    }

    const newStatus = !currentClient.isActive;

    // Toggle Mautic client status
    const mauticClient = await prisma.mauticClient.update({
      where: { id: parseInt(id) },
      data: { isActive: newStatus },
    });

    // If linked to a main Client, toggle that too
    if (mauticClient.clientId) {
      await prisma.client.update({
        where: { id: mauticClient.clientId },
        data: { isActive: newStatus },
      });
      logger.debug(
        `✓ ${newStatus ? "Activated" : "Deactivated"} linked client (ID: ${mauticClient.clientId
        })`
      );
    }

    res.json({
      success: true,
      message: `Mautic service ${newStatus ? "activated" : "deactivated"
        } successfully`,
      data: {
        ...mauticClient,
        password: undefined,
      },
    });
  } catch (error) {
    logger.error("Error toggling client status:", error);
    res.status(500).json({
      success: false,
      message: "Failed to toggle client status",
      error: error.message,
    });
  }
});

/**
 * POST /api/mautic/clients/test-connection
 * Test Mautic connection
 */
router.post("/clients/test-connection", async (req, res) => {
  try {
    const { mauticUrl, username, password } = req.body;

    if (!mauticUrl || !username || !password) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    const result = await mauticAPI.testConnection({
      mauticUrl,
      username,
      password,
    });

    res.json(result);
  } catch (error) {
    logger.error("Error testing connection:", error);
    res.status(500).json({
      success: false,
      message: "Failed to test connection",
      error: error.message,
    });
  }
});

// ============================================
// DASHBOARD & METRICS ROUTES
// ============================================

/**
 * GET /api/mautic/dashboard
 * Get dashboard metrics (legacy - use /stats/overview for new code)
 */
router.get("/dashboard", async (req, res) => {
  try {
    const { clientId } = req.query;

    const metrics = await dataService.getDashboardMetrics(
      clientId ? parseInt(clientId) : null
    );

    res.json(metrics);
  } catch (error) {
    logger.error("Error fetching dashboard metrics:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch dashboard metrics",
      error: error.message,
    });
  }
});

// ============================================
// HIERARCHICAL STATS API
// Application > Client > Campaign > Email
// ============================================

/**
 * GET /api/mautic/stats/overview
 * Application-level stats - filtered by user's accessible clients
 * Query params: fromDate, toDate
 */
router.get("/stats/overview", authenticate, async (req, res) => {
  try {
    const { fromDate, toDate } = req.query;

    // Get accessible client IDs for current user
    let clientIds = null;
    if (!hasFullAccess(req.user)) {
      const accessibleClientIds = await getAccessibleClientIds(req.user.id, req.user);
      clientIds = accessibleClientIds;
    }

    // ⚡ CRITICAL FIX: Filter out SMS-only clients to prevent duplicate email stats
    // Even if user has access to SMS-only clients, exclude them from email stats
    if (clientIds) {
      const validClients = await prisma.mauticClient.findMany({
        where: {
          id: { in: clientIds },
          reportId: { not: 'sms-only' }
        },
        select: { id: true }
      });
      clientIds = validClients.map(c => c.id);
    }

    const result = await statsService.getApplicationStats({ fromDate, toDate, clientIds });
    res.json(result);
  } catch (error) {
    logger.error("Error fetching application stats:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch application stats",
      error: error.message,
    });
  }
});

/**
 * GET /api/mautic/clients/:clientId/stats
 * Client-level stats - all campaigns for this client
 * Query params: fromDate, toDate, includeCampaigns, page, limit
 */
router.get("/clients/:clientId/stats", async (req, res) => {
  try {
    const { clientId } = req.params;
    const { fromDate, toDate, includeCampaigns, page, limit } = req.query;

    const result = await statsService.getClientStats(parseInt(clientId), {
      fromDate,
      toDate,
      includeCampaigns: includeCampaigns !== 'false',
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 20
    });

    if (!result.success) {
      return res.status(404).json(result);
    }

    res.json(result);
  } catch (error) {
    logger.error("Error fetching client stats:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch client stats",
      error: error.message,
    });
  }
});

/**
 * GET /api/mautic/campaigns/:campaignId/stats
 * Campaign-level stats - all emails in this campaign
 * Query params: fromDate, toDate, page, limit
 */
router.get("/campaigns/:campaignId/stats", async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { fromDate, toDate, page, limit } = req.query;

    const result = await statsService.getCampaignStats(parseInt(campaignId), {
      fromDate,
      toDate,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 50
    });

    if (!result.success) {
      return res.status(404).json(result);
    }

    res.json(result);
  } catch (error) {
    logger.error("Error fetching campaign stats:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch campaign stats",
      error: error.message,
    });
  }
});

/**
 * GET /api/mautic/emails/:emailId/stats
 * Email-level stats - individual email (granular entry point)
 * Query params: includeHistory, fromDate, toDate
 */
router.get("/emails/:emailId/stats", async (req, res) => {
  try {
    const { emailId } = req.params;
    const { includeHistory, fromDate, toDate } = req.query;

    const result = await statsService.getEmailStats(parseInt(emailId), {
      includeHistory: includeHistory === 'true',
      fromDate,
      toDate
    });

    if (!result.success) {
      return res.status(404).json(result);
    }

    res.json(result);
  } catch (error) {
    logger.error("Error fetching email stats:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch email stats",
      error: error.message,
    });
  }
});

/**
 * GET /api/mautic/emails
 * Get emails with pagination and filtering
 */
router.get("/emails", async (req, res) => {
  try {
    const { clientId, clientIds, page = 1, limit = 50 } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = {};
    if (clientId) {
      where.clientId = parseInt(clientId);
    } else if (clientIds) {
      const ids = clientIds.split(',').map(id => parseInt(id)).filter(id => !isNaN(id));
      if (ids.length > 0) {
        where.clientId = { in: ids };
      }
    }

    const [emails, total] = await Promise.all([
      prisma.mauticEmail.findMany({
        where,
        skip,
        take: parseInt(limit),
        orderBy: { sentCount: "desc" },
        include: {
          client: {
            select: { name: true },
          },
        },
      }),
      prisma.mauticEmail.count({ where }),
    ]);

    res.json({
      success: true,
      data: {
        emails,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / parseInt(limit)),
        },
      },
    });
  } catch (error) {
    logger.error("Error fetching emails:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch emails",
      error: error.message,
    });
  }
});

/**
 * GET /api/mautic/segments
 * Get segments with contact counts, sorted by contactCount descending
 */
router.get("/segments", async (req, res) => {
  try {
    const { clientId, clientIds, page = 1, limit = 50 } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = {};
    if (clientId) {
      where.clientId = parseInt(clientId);
    } else if (clientIds) {
      const ids = clientIds.split(',').map(id => parseInt(id)).filter(id => !isNaN(id));
      if (ids.length > 0) {
        where.clientId = { in: ids };
      }
    }

    const [segments, total] = await Promise.all([
      prisma.mauticSegment.findMany({
        where,
        skip,
        take: parseInt(limit),
        orderBy: { contactCount: "desc" },
        include: {
          client: {
            select: { name: true },
          },
        },
      }),
      prisma.mauticSegment.count({ where }),
    ]);

    // Calculate total contacts across all segments
    const totalContacts = segments.reduce((sum, segment) => sum + (segment.contactCount || 0), 0);

    res.json({
      success: true,
      data: {
        segments,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / parseInt(limit)),
        },
        totalContacts: totalContacts,
        segmentCount: segments.length
      }
    });
  } catch (error) {
    logger.error("Error fetching segments:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch segments",
      error: error.message,
    });
  }
});

/**
 * GET /api/mautic/campaigns
 * Get campaigns with pagination and filtering
 */
router.get("/campaigns", async (req, res) => {
  try {
    const { clientId, clientIds, page = 1, limit = 50 } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = {};
    if (clientId) {
      where.clientId = parseInt(clientId);
    } else if (clientIds) {
      // Parse comma-separated clientIds for access control filtering
      const ids = clientIds.split(',').map(id => parseInt(id)).filter(id => !isNaN(id));
      if (ids.length > 0) {
        where.clientId = { in: ids };
      }
    }

    const [campaigns, total] = await Promise.all([
      prisma.mauticCampaign.findMany({
        where,
        skip,
        take: parseInt(limit),
        orderBy: { mauticCampaignId: "desc" },
        include: {
          client: {
            select: { name: true },
          },
        },
      }),
      prisma.mauticCampaign.count({ where }),
    ]);

    res.json({
      success: true,
      data: {
        campaigns,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / parseInt(limit)),
        },
      },
    });
  } catch (error) {
    logger.error("Error fetching campaigns:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch campaigns",
      error: error.message,
    });
  }
});

/**
 * GET /api/mautic/reports
 * Get email reports with pagination and filtering
 */
router.get("/reports", async (req, res) => {
  try {
    const { clientId, clientIds, page = 1, limit = 100, fromDate, toDate } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = {};
    const normalizedClientIds = [];

    if (clientId) {
      const parsedClientId = parseInt(clientId, 10);
      if (!Number.isNaN(parsedClientId)) {
        normalizedClientIds.push(parsedClientId);
      }
    }

    if (clientIds) {
      const parsedClientIds = String(clientIds)
        .split(',')
        .map((value) => parseInt(value.trim(), 10))
        .filter((value) => !Number.isNaN(value));

      normalizedClientIds.push(...parsedClientIds);
    }

    const uniqueClientIds = [...new Set(normalizedClientIds)];
    if (uniqueClientIds.length === 1) {
      where.clientId = uniqueClientIds[0];
    } else if (uniqueClientIds.length > 1) {
      where.clientId = { in: uniqueClientIds };
    }

    // Date range filter on dateSent
    if (fromDate || toDate) {
      where.dateSent = {};
      if (fromDate) {
        where.dateSent.gte = new Date(fromDate);
      }
      if (toDate) {
        const endDate = new Date(toDate);
        endDate.setHours(23, 59, 59, 999);
        where.dateSent.lte = endDate;
      }
    }

    const [reports, total] = await Promise.all([
      prisma.mauticEmailReport.findMany({
        where,
        skip,
        take: parseInt(limit),
        orderBy: { dateSent: "desc" },
        include: {
          client: {
            select: { id: true, name: true }
          }
        }
      }),
      prisma.mauticEmailReport.count({ where }),
    ]);

    res.json({
      success: true,
      data: reports,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    logger.error("Error fetching reports:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch reports",
      error: error.message,
    });
  }
});

router.post("/reports/import-json", async (req, res) => {
  try {
    const {
      clientIds = [8, 9],
      months,
      baseDir
    } = req.body || {};

    const result = await reportJsonImportService.importMonthsForClients({
      clientIds: Array.isArray(clientIds) ? clientIds : [clientIds],
      months: Array.isArray(months) ? months : [months],
      baseDir
    });

    res.json(result);
  } catch (error) {
    logger.error('Error importing report JSON:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to import report JSON',
      error: error.message
    });
  }
});

// ============================================
// SYNC ROUTES
// ============================================

/**
 * GET /api/mautic/sync/progress
 * Get detailed per-client sync progress
 */
router.get("/sync/progress", async (req, res) => {
  try {
    const progress = await schedulerService.getSyncProgress();
    res.json({
      success: true,
      data: progress
    });
  } catch (error) {
    logger.error("Error fetching sync progress:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch sync progress",
      error: error.message
    });
  }
});

/**
 * GET /api/mautic/sync/status
 * Get current sync status
 */
// Cache for sync status to reduce DB queries
let syncStatusCache = {
  lastSyncAt: null,
  activeClientsCount: 0,
  lastUpdated: 0
};
const SYNC_STATUS_CACHE_TTL = 5000; // 5 seconds

router.get("/sync/status", async (req, res) => {
  const elapsedSeconds = isSyncInProgress
    ? Math.floor((Date.now() - currentSyncStartTime) / 1000)
    : 0;

  // Use cached values if available and fresh (unless sync is in progress)
  const now = Date.now();
  const cacheValid = (now - syncStatusCache.lastUpdated) < SYNC_STATUS_CACHE_TTL;

  let lastSyncAt = syncStatusCache.lastSyncAt;
  let activeClientsCount = syncStatusCache.activeClientsCount;

  // Only query DB if cache is stale or sync just completed
  if (!cacheValid || (!isSyncInProgress && syncStatusCache.lastSyncAt === null)) {
    try {
      const lastSync = await prisma.syncLog.findFirst({
        where: {
          source: 'mautic',
          status: 'success'
        },
        orderBy: { syncCompletedAt: 'desc' }
      });
      lastSyncAt = lastSync?.syncCompletedAt || null;

      // If no sync log, check MauticClient lastSyncAt as fallback
      if (!lastSyncAt) {
        const client = await prisma.mauticClient.findFirst({
          where: { lastSyncAt: { not: null } },
          orderBy: { lastSyncAt: 'desc' }
        });
        lastSyncAt = client?.lastSyncAt || null;
      }

      // Count active Mautic clients for hasCredentials flag
      activeClientsCount = await prisma.mauticClient.count({
        where: { isActive: true }
      });

      // Update cache
      syncStatusCache = {
        lastSyncAt,
        activeClientsCount,
        lastUpdated: now
      };
    } catch (error) {
      logger.error("Error fetching last sync time:", error);
    }
  }

  const hasCredentials = activeClientsCount > 0;

  res.json({
    success: true,
    data: {
      isSyncing: isSyncInProgress,
      elapsedTime: elapsedSeconds,
      startTime: currentSyncStartTime,
      syncType: currentSyncType,
      lastSyncAt: lastSyncAt,
      lastUpdated: lastSyncAt,
      lastSync: lastSyncAt,
      hasCredentials: hasCredentials,
      activeClientsCount: activeClientsCount,
    },
  });
});

/**
 * POST /api/mautic/sync/all
 * Manually trigger sync for all clients
 */
router.post("/sync/all", async (req, res) => {
  try {
    // Check if sync is already in progress
    if (isSyncInProgress) {
      const elapsedSeconds = Math.floor(
        (Date.now() - currentSyncStartTime) / 1000
      );
      return res.status(409).json({
        success: false,
        message: `Sync already in progress (running for ${elapsedSeconds}s). Please wait...`,
        isSyncing: true,
        elapsedTime: elapsedSeconds,
      });
    }

    // Set sync in progress
    isSyncInProgress = true;
    currentSyncStartTime = Date.now();
    currentSyncType = "all";

    logger.debug("Manual sync triggered for all clients");

    // Respond immediately to avoid frontend timeout
    res.json({
      success: true,
      message: "Sync started in background",
      isSyncing: true,
    });

    // Read optional query param `forceFull=true` to force full re-fetch
    const forceFull = String(req.query.forceFull || "false") === "true";

    // Run sync in background
    schedulerService
      .syncAllClients({ forceFull })
      .then((result) => {
        const detailsRaw = result?.results?.details;
        const details = Array.isArray(detailsRaw)
          ? detailsRaw
          : (detailsRaw && typeof detailsRaw === 'object')
            ? Object.values(detailsRaw)
            : [];

        const lines = details
          .filter(Boolean)
          .map((d) => {
            const name = d.clientName || d.clientId || 'unknown-client';
            const ok = d.success ? 'OK' : 'FAIL';
            const emails = d.emails?.total ?? 0;
            const campaigns = d.campaigns?.total ?? 0;
            const segments = d.segments?.total ?? 0;
            const smsStats = d.smsStats?.total ?? 0;
            const smsReplies = d.smsStats?.replies ?? 0;
            const repNew = d.emailReports?.created ?? 0;
            const repSkip = d.emailReports?.skipped ?? 0;
            const repDb = d.emailReports?.totalInDb ?? 0;
            return `${ok} | ${name} | emails=${emails} campaigns=${campaigns} segments=${segments} smsStats=${smsStats} replies=${smsReplies} emailReports(new=${repNew}, skipped=${repSkip}, db=${repDb})`;
          });

        logger.info(`✅ Sync completed: ${result?.successful || 0}/${result?.totalClients || 0} clients | duration=${result?.duration || '?'}s`);
        for (const line of lines) logger.info(line);
        // Send email notification
        const duration = Math.floor((Date.now() - currentSyncStartTime) / 1000);
        notifyMauticSyncCompleted({
          type: "all",
          totalClients: result.totalClients || 0,
          successful: result.successful || 0,
          failed: result.failed || 0,
          durationSeconds: duration,
        }).catch((err) =>
          logger.error("Failed to send sync completion email:", err)
        );

        // After successful Mautic sync, trigger DropCowboy data refresh to re-match clients
        // ✅ Only if SFTP credentials are configured AND user explicitly requested it
        // ⚡ OPTIMIZATION: Skip DropCowboy sync by default to avoid unnecessary overhead
        const triggerDropCowboy = String(req.query.syncDropCowboy || "false") === "true";

        if (triggerDropCowboy) {
          (async () => {
            try {
              // Check if SFTP credentials exist before triggering DropCowboy sync
              const sftpCred = await prisma.sFTPCredential.findFirst({
                orderBy: { updatedAt: 'desc' }
              });

              if (!sftpCred || !sftpCred.host || !sftpCred.username || !sftpCred.password) {
                logger.debug("⏭️  Skipping DropCowboy sync: No SFTP credentials configured");
                return;
              }

              logger.debug(
                "🔄 Triggering DropCowboy data refresh after Mautic sync..."
              );
              const dropCowboyDataService = new DropCowboyDataService();
              const dropCowboyScheduler = new DropCowboyScheduler();

              // Clear all existing DropCowboy data
              const clearResult =
                await dropCowboyDataService.clearAllDropCowboyData();
              logger.debug("DropCowboy data cleared:", clearResult);

              // Trigger SFTP sync to re-fetch and re-match data to Mautic clients
              const syncResult = await dropCowboyScheduler.fetchAndProcessData();

              if (syncResult.skipped) {
                logger.debug(`⏭️  DropCowboy sync skipped: ${syncResult.reason}`);
              } else {
                logger.debug(
                  "DropCowboy SFTP sync completed after Mautic sync:",
                  syncResult
                );
              }
            } catch (syncError) {
              logger.error(
                "Failed to refresh DropCowboy data after Mautic sync:",
                syncError
              );
            }
          })();
        } else {
          logger.debug("⏭️  Skipping DropCowboy sync (not requested via ?syncDropCowboy=true)");
        }
      })
      .catch((error) => {
        logger.error("❌ Sync failed:", error);
        // Send email notification
        notifyMauticSyncFailed({
          type: "all",
          error: error.message || String(error),
        }).catch((err) =>
          logger.error("Failed to send sync failure email:", err)
        );
      })
      .finally(() => {
        // Always reset sync status
        isSyncInProgress = false;
        currentSyncStartTime = null;
        currentSyncType = null;
        // Invalidate cache so next status check gets fresh data
        syncStatusCache.lastUpdated = 0;
      });
  } catch (error) {
    logger.error("Error syncing all clients:", error);

    // Reset sync status on error
    isSyncInProgress = false;
    currentSyncStartTime = null;
    currentSyncType = null;
    // Invalidate cache
    syncStatusCache.lastUpdated = 0;

    res.status(500).json({
      success: false,
      message: "Failed to sync clients",
      error: error.message,
    });
  }
});

/**
 * POST /api/mautic/sync/:clientId
 * Manually trigger sync for specific client
 */
router.post("/sync/:clientId", async (req, res) => {
  try {
    const { clientId } = req.params;

    // Check if sync is already in progress
    if (isSyncInProgress) {
      const elapsedSeconds = Math.floor(
        (Date.now() - currentSyncStartTime) / 1000
      );
      return res.status(409).json({
        success: false,
        message: `Sync already in progress (running for ${elapsedSeconds}s). Please wait...`,
        isSyncing: true,
        elapsedTime: elapsedSeconds,
      });
    }

    // Set sync in progress
    isSyncInProgress = true;
    currentSyncStartTime = Date.now();
    currentSyncType = clientId;

    logger.debug(`Manual sync triggered for client ${clientId}`);

    // Respond immediately to avoid frontend timeout
    res.json({
      success: true,
      message: "Sync started in background",
      isSyncing: true,
    });

    const forceFull = String(req.query.forceFull || "false") === "true";
    // If forceFull requested for a single client, clear its lastSyncAt before sync
    if (forceFull) {
      try {
        await req.app.locals.prisma?.mauticClient.updateMany({
          where: { id: parseInt(clientId) },
          data: { lastSyncAt: null },
        });
      } catch (e) {
        // fallback: use direct import
        try {
          const prisma = (await import("../../../prisma/client.js")).default;
          await prisma.mauticClient.updateMany({
            where: { id: parseInt(clientId) },
            data: { lastSyncAt: null },
          });
        } catch (ee) {
          logger.warn(
            "Could not clear lastSyncAt for client (forceFull):",
            ee.message
          );
        }
      }
    }

    // Run sync in background
    schedulerService
      .syncClient(parseInt(clientId))
      .then((result) => {
        const name = result?.data?.clientName || result?.clientName || clientId;
        const ok = result?.success ? 'OK' : 'FAIL';
        const emails = result?.data?.emails?.total ?? result?.emails?.total ?? 0;
        const campaigns = result?.data?.campaigns?.total ?? result?.campaigns?.total ?? 0;
        const segments = result?.data?.segments?.total ?? result?.segments?.total ?? 0;
        const rep = result?.data?.emailReports || result?.emailReports || {};
        const repNew = rep.created ?? 0;
        const repSkip = rep.skipped ?? 0;
        const repDb = rep.totalInDb ?? 0;
        logger.info(`✅ Sync completed: ${ok} | ${name} | emails=${emails} campaigns=${campaigns} segments=${segments} emailReports(new=${repNew}, skipped=${repSkip}, db=${repDb})`);
        // Send email notification
        const duration = Math.floor((Date.now() - currentSyncStartTime) / 1000);
        notifyMauticSyncCompleted({
          type: "single",
          totalClients: 1,
          successful: result.success ? 1 : 0,
          failed: result.success ? 0 : 1,
          durationSeconds: duration,
        }).catch((err) =>
          logger.error("Failed to send sync completion email:", err)
        );

        // After successful Mautic sync, trigger DropCowboy data refresh to re-match clients
        // ✅ Only if SFTP credentials are configured AND user explicitly requested it
        // ⚡ OPTIMIZATION: Skip DropCowboy sync by default to avoid unnecessary overhead
        if (result.success) {
          const triggerDropCowboy = String(req.query.syncDropCowboy || "false") === "true";

          if (triggerDropCowboy) {
            (async () => {
              try {
                // Check if SFTP credentials exist before triggering DropCowboy sync
                const sftpCred = await prisma.sFTPCredential.findFirst({
                  orderBy: { updatedAt: 'desc' }
                });

                if (!sftpCred || !sftpCred.host || !sftpCred.username || !sftpCred.password) {
                  logger.debug("⏭️  Skipping DropCowboy sync: No SFTP credentials configured");
                  return;
                }

                logger.debug(
                  "🔄 Triggering DropCowboy data refresh after Mautic sync..."
                );
                const dropCowboyDataService = new DropCowboyDataService();
                const dropCowboyScheduler = new DropCowboyScheduler();

                // Clear all existing DropCowboy data
                const clearResult =
                  await dropCowboyDataService.clearAllDropCowboyData();
                logger.debug("DropCowboy data cleared:", clearResult);

                // Trigger SFTP sync to re-fetch and re-match data to Mautic clients
                const syncResult =
                  await dropCowboyScheduler.fetchAndProcessData();

                if (syncResult.skipped) {
                  logger.debug(`⏭️  DropCowboy sync skipped: ${syncResult.reason}`);
                } else {
                  logger.debug(
                    "DropCowboy SFTP sync completed after Mautic sync:",
                    syncResult
                  );
                }
              } catch (syncError) {
                logger.error(
                  "Failed to refresh DropCowboy data after Mautic sync:",
                  syncError
                );
              }
            })();
          } else {
            logger.debug("⏭️  Skipping DropCowboy sync (not requested via ?syncDropCowboy=true)");
          }
        }
      })
      .catch((error) => {
        logger.error("❌ Sync failed:", error);
        // Send email notification
        notifyMauticSyncFailed({
          type: "single",
          error: error.message || String(error),
        }).catch((err) =>
          logger.error("Failed to send sync failure email:", err)
        );
      })
      .finally(() => {
        // Always reset sync status
        isSyncInProgress = false;
        currentSyncStartTime = null;
        currentSyncType = null;
        // Invalidate cache so next status check gets fresh data
        syncStatusCache.lastUpdated = 0;
      });
  } catch (error) {
    logger.error("Error syncing client:", error);

    // Reset sync status on error
    isSyncInProgress = false;
    currentSyncStartTime = null;
    currentSyncType = null;
    // Invalidate cache
    syncStatusCache.lastUpdated = 0;

    res.status(500).json({
      success: false,
      message: "Failed to sync client",
      error: error.message,
    });
  }
});

// ============================================
// SMS CAMPAIGNS ROUTES
// ============================================

/**
 * GET /api/mautic/smses
 * Get all SMS campaigns (from all clients)
 * Supports role-based access control
 */
router.get("/smses", authenticate, async (req, res) => {
  try {
    const accessibleClientIds = await getAccessibleClientIds(req);

    const campaigns = await smsService.getAllSmsCampaigns(accessibleClientIds);

    res.json({
      success: true,
      data: campaigns
    });
  } catch (error) {
    logger.error("Failed to fetch SMS campaigns:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch SMS campaigns",
      error: error.message
    });
  }
});

/**
 * GET /api/mautic/smses/:id/stats
 * Get statistics for a specific SMS campaign
 */
router.get("/smses/:id/stats", async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 100 } = req.query;

    const sms = await prisma.mauticSms.findUnique({
      where: { id: parseInt(id) },
      include: {
        client: { select: { name: true } },
        smsClient: { select: { name: true } }
      }
    });

    if (!sms) {
      return res.status(404).json({
        success: false,
        message: "SMS campaign not found"
      });
    }

    const stats = await smsService.getCampaignStats(parseInt(id), {
      page: parseInt(page),
      limit: parseInt(limit)
    });

    res.json({
      success: true,
      data: {
        campaignName: sms.name,
        clientName: sms.client?.name || sms.smsClient?.name || 'Unknown',
        ...stats
      }
    });
  } catch (error) {
    logger.error("Failed to fetch SMS stats:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch SMS statistics",
      error: error.message
    });
  }
});

/**
 * GET /api/contact/:id
 * Get contact activity (SMS messages and replies)
 * Fetch from database, if not found fetch from endpoint on-demand
 */
router.get("/contact/:id", async (req, res) => {
  const { id } = req.params;
  const { smsId } = req.query;

  try {
    // First find from database, else fetch on demand if not found
    const smsStat = await prisma.mauticSmsStat.findFirst({
      where: {
        leadId: parseInt(id),
        mauticSmsId: parseInt(smsId)
      },
      select: { mobile: true, messageText: true, replyText: true }
    });

    if (smsStat) {
      res.json({
        id,
        mobile: smsStat.mobile,
        message: smsStat.messageText,
        reply: smsStat.replyText
      });

      return;
    }

    // Find which client owns this smsId
    const smsCampaign = await prisma.mauticSms.findFirst({
      where: { mauticId: parseInt(smsId, 10) },
      orderBy: { updatedAt: 'desc' },
      include: {
        client: true,           // Grouped Mautic client (e.g., Century)
        smsClient: true         // Original SMS client that fetched this campaign
      }
    });

    if (!smsCampaign) {
      return res.status(404).json({ error: "SMS campaign not found" });
    }

    // ✅ KEY FIX: Use the ORIGINAL SMS client credentials if available
    // SMS campaigns fetched from IPS but grouped under Century still need IPS credentials to fetch contact activity
    // because the contact ONLY exists in IPS's Mautic instance, not Century's
    const authenticatedClient = smsCampaign.smsClient || smsCampaign.client;

    if (!authenticatedClient) {
      return res.status(404).json({ error: "No credentials found for SMS campaign's original source client" });
    }

    // Create mautic client instance using ORIGINAL client's credentials (SMS client if available, else grouped client)
    const apiClient = mauticAPI.createClient(authenticatedClient);

    // Fetch contact details + activity from Mautic
    const [activityRes, contactRes] = await Promise.all([
      apiClient.get(`/contacts/${id}/activity`),
      apiClient.get(`/contacts/${id}`)
    ]);

    const contact = contactRes.data?.contact || {};
    const events = activityRes.data?.events || [];

    // Filter events - only SMS sends relevant to this campaign and replies
    const filteredMessageEvents = events.filter(
      e => e.event === "sms.sent" && e.details?.stat?.sms_id?.toString() === smsCampaign.mauticId.toString()
    );

    const filteredReplyEvents = events.filter(
      e => e.event === "sms_reply"
    );

    const messages = filteredMessageEvents.map(e => e.details?.stat?.message || "");
    const replies = filteredReplyEvents.map(e => e.details?.message || "");

    // const name = `${contact.fields?.core?.firstname?.value || ""} ${contact.fields?.core?.lastname?.value || ""}`.trim();
    const mobile = contact.fields?.core?.mobile?.value || "";

    res.json({
      id,
      mobile,
      message: messages[0],
      reply: replies[0]
    });

  } catch (err) {
    console.error("❌ Error fetching contact activity:", err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;