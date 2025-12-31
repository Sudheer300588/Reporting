import logger from '../../../utils/logger.js';
import express from "express";
import mauticAPI from "../services/mauticAPI.js";
import dataService from "../services/dataService.js";
import MauticSchedulerService from "../services/schedulerService.js";
import encryptionService from "../services/encryption.js";
import prisma from "../../../prisma/client.js";
import {
  notifyMauticSyncCompleted,
  notifyMauticSyncFailed,
} from "../../../utils/emailHelper.js";
import DropCowboyDataService from "../../dropCowboy/services/dataService.js";
import DropCowboyScheduler from "../../dropCowboy/services/schedulerService.js";

const router = express.Router();
const schedulerService = new MauticSchedulerService();

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
router.get("/clients/:clientId/segments", async (req, res) => {
  try {
    const { clientId } = req.params;
    const segments = await prisma.mauticSegment.findMany({
      where: { clientId: parseInt(clientId) },
    });
    res.json({ success: true, data: segments });
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

    // Add date range filter
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

    // ✅ Aggregate counts grouped by eId
    const aggregated = await prisma.mauticEmailReport.groupBy({
      by: ["eId"],
      where,
      _count: {
        eId: true, // total records (sends)
        dateRead: true, // number of rows with dateRead not null
      },
    });

    // Optional: fetch email metadata (subject/emailAddress)
    const uniqueEids = aggregated.map((a) => a.eId).filter(Boolean);
    const emailMeta = await prisma.mauticEmailReport.findMany({
      where: { eId: { in: uniqueEids } },
      distinct: ["eId"],
      select: { eId: true, subject: true, emailAddress: true },
    });

    const metaMap = new Map(emailMeta.map((e) => [e.eId, e]));

    // Normalize for frontend
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
    logger.error("❌ Error fetching aggregated Mautic reports:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch email reports",
      error: error.message,
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

      // Start background month-by-month backfill (non-blocking)
      // If user provided fromDate/toDate use that range, otherwise default to 2024-05-01 → 2025-11-25
      const backfillFrom = fromDate || "2024-05-01";
      const backfillTo = toDate || "2025-11-25";
      const pageLimit = limit || 5000; // default per-page limit; can be customized from frontend

      // Run backfill in background so client creation returns immediately
      setImmediate(async () => {
        try {
          logger.debug(
            `🔁 Starting background monthly backfill for client ${client.id} (${backfillFrom} → ${backfillTo})`
          );

          // Helper to iterate months inclusive
          function monthsBetween(startISO, endISO) {
            const start = new Date(startISO);
            const end = new Date(endISO);
            const months = [];
            let y = start.getFullYear();
            let m = start.getMonth() + 1; // 1-based
            while (
              y < end.getFullYear() ||
              (y === end.getFullYear() && m <= end.getMonth() + 1)
            ) {
              months.push({ year: y, month: m });
              if (m === 12) {
                y++;
                m = 1;
              } else {
                m++;
              }
            }
            return months;
          }

          const monthList = monthsBetween(backfillFrom, backfillTo);

          const PAUSE_MS = parseInt(
            process.env.MAUTIC_BACKFILL_PAUSE_MS || "2000",
            10
          );

          async function sleep(ms) {
            return new Promise((r) => setTimeout(r, ms));
          }

          for (const mm of monthList) {
            const year = mm.year;
            const month = mm.month;
            const ym = `${year}-${String(month).padStart(2, "0")}`;

            // Skip if month already fetched
            const existing = await prisma.mauticFetchedMonth.findFirst({
              where: { clientId: client.id, yearMonth: ym },
            });
            if (existing) {
              logger.debug(`   ⏭️ Skipping ${ym}, already fetched`);
              continue;
            }

            // Compute from/to for this month
            const from = `${ym}-01 00:00:00`;
            // determine last day (respect final end date if same month)
            const lastDay = new Date(year, month, 0).getDate();
            let toDay = lastDay;
            const endDate = new Date(backfillTo);
            if (
              endDate.getFullYear() === year &&
              endDate.getMonth() + 1 === month
            ) {
              // Use provided end day (e.g., 25 for Nov 2025)
              toDay = Math.min(toDay, endDate.getDate());
            }
            const to = `${ym}-${String(toDay).padStart(2, "0")} 23:59:59`;

            try {
              logger.debug(`   ▶️ Backfilling ${ym} (${from} → ${to})`);
              const r = await mauticAPI.fetchHistoricalReports(
                client,
                from,
                to,
                pageLimit
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

            // Small pause between months to reduce load and avoid overwhelming Mautic or this server
            try {
              await sleep(PAUSE_MS);
            } catch (e) {
              /* ignore */
            }
          }

          logger.debug(
            `🔁 Background backfill finished for client ${client.id}`
          );
        } catch (bgErr) {
          logger.error("Background backfill error:", bgErr.message);
        }
      });
    }

    res.json({
      success: true,
      message:
        "Mautic client created successfully" +
        (mainClientId ? " and linked to main client" : ""),
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
    if (password) updateData.password = encryptionService.encrypt(password);
    if (typeof isActive === "boolean") updateData.isActive = isActive;

    const client = await prisma.mauticClient.update({
      where: { id: parseInt(id) },
      data: updateData,
    });

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
          limit || 200000
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

        const months = monthsBetween(start, end);
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
              pageLimit || 200000
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

    await prisma.$transaction(async (tx) => {
      const deletedEmails = await tx.mauticEmail.deleteMany({ where: { clientId: clientId } });
      const deletedReports = await tx.mauticEmailReport.deleteMany({ where: { clientId: clientId } });
      const deletedCampaigns = await tx.mauticCampaign.deleteMany({ where: { clientId: clientId } });
      const deletedSegments = await tx.mauticSegment.deleteMany({ where: { clientId: clientId } });
      const deletedSyncLogs = await tx.mauticSyncLog.deleteMany({ where: { mauticClientId: clientId } });
      const deletedMonths = await tx.mauticFetchedMonth.deleteMany({ where: { clientId: clientId } });
      
      logger.debug(`Deleted ${deletedEmails.count} emails, ${deletedReports.count} reports, ${deletedCampaigns.count} campaigns, ${deletedSegments.count} segments, ${deletedSyncLogs.count} sync logs, ${deletedMonths.count} fetched months`);
      
      await tx.mauticClient.delete({ where: { id: clientId } });

      if (linkedClientId) {
        const otherMauticLinks = await tx.mauticClient.count({
          where: { clientId: linkedClientId },
        });
        if (otherMauticLinks === 0) {
          await tx.dropCowboyCampaign.updateMany({
            where: { clientId: linkedClientId },
            data: { clientId: null },
          });
          await tx.client.delete({ where: { id: linkedClientId } });
          logger.debug(`Deleted linked main client (ID: ${linkedClientId})`);
        }
      }
    });

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
        `✓ ${newStatus ? "Activated" : "Deactivated"} linked client (ID: ${
          mauticClient.clientId
        })`
      );
    }

    res.json({
      success: true,
      message: `Mautic service ${
        newStatus ? "activated" : "deactivated"
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
 * Get dashboard metrics
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

/**
 * GET /api/mautic/emails
 * Get emails with pagination and filtering
 */
router.get("/emails", async (req, res) => {
  try {
    const { clientId, page = 1, limit = 50 } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = {};
    if (clientId) where.clientId = parseInt(clientId);

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
 * Get segments
 */
router.get("/segments", async (req, res) => {
  try {
    const { clientId } = req.query;

    const where = {};
    if (clientId) where.clientId = parseInt(clientId);

    const segments = await prisma.mauticSegment.findMany({
      where,
      orderBy: { contactCount: "desc" },
      include: {
        client: {
          select: { name: true },
        },
      },
    });

    res.json({
      success: true,
      data: segments,
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
    const { clientId, page = 1, limit = 50 } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = {};
    if (clientId) where.clientId = parseInt(clientId);

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
    const { clientId, page = 1, limit = 100, fromDate, toDate } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = {};
    if (clientId) where.clientId = parseInt(clientId);

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
          email: {
            select: { mauticEmailId: true, name: true, subject: true },
          },
        },
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

// ============================================
// SYNC ROUTES
// ============================================

/**
 * GET /api/mautic/sync/status
 * Get current sync status
 */
router.get("/sync/status", async (req, res) => {
  const elapsedSeconds = isSyncInProgress
    ? Math.floor((Date.now() - currentSyncStartTime) / 1000)
    : 0;

  // Get last successful sync from database
  let lastSyncAt = null;
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
  } catch (error) {
    logger.error("Error fetching last sync time:", error);
  }

  res.json({
    success: true,
    data: {
      isSyncing: isSyncInProgress,
      elapsedTime: elapsedSeconds,
      startTime: currentSyncStartTime,
      syncType: currentSyncType,
      lastSyncAt: lastSyncAt,
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
        logger.debug("✅ Sync completed:", result);
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
        (async () => {
          try {
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
            logger.debug(
              "DropCowboy SFTP sync completed after Mautic sync:",
              syncResult
            );
          } catch (syncError) {
            logger.error(
              "Failed to refresh DropCowboy data after Mautic sync:",
              syncError
            );
          }
        })();
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
      });
  } catch (error) {
    logger.error("Error syncing all clients:", error);

    // Reset sync status on error
    isSyncInProgress = false;
    currentSyncStartTime = null;
    currentSyncType = null;

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
        logger.debug("✅ Sync completed:", result);
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
        if (result.success) {
          (async () => {
            try {
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
              logger.debug(
                "DropCowboy SFTP sync completed after Mautic sync:",
                syncResult
              );
            } catch (syncError) {
              logger.error(
                "Failed to refresh DropCowboy data after Mautic sync:",
                syncError
              );
            }
          })();
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
      });
  } catch (error) {
    logger.error("Error syncing client:", error);

    // Reset sync status on error
    isSyncInProgress = false;
    currentSyncStartTime = null;
    currentSyncType = null;

    res.status(500).json({
      success: false,
      message: "Failed to sync client",
      error: error.message,
    });
  }
});

export default router;
