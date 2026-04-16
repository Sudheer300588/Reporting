import logger from '../../../utils/logger.js';
import { format, parseISO, isWithinInterval } from "date-fns";
import prisma from "../../../prisma/client.js";
import { Prisma } from "@prisma/client";


// Simple in-memory cache for frequently accessed data
const cache = {
  mauticClientIds: { data: null, timestamp: null, ttl: 60000 }, // 60 seconds
  campaignMappings: { data: null, timestamp: null, ttl: 60000 }, // 60 seconds
};

class DataService {
  async saveCampaignData(campaignData) {
    try {
      logger.debug(`💾 Saving ${campaignData.length} campaign-file groups to database...`);
      let totalRecordsInserted = 0;

      // Cache Mautic clients once for the whole batch
      const mauticClients = await prisma.client.findMany({
        where: { clientType: "mautic" },
      });
      const sortedClients = mauticClients.sort((a, b) =>
        b.name.length - a.name.length || a.id - b.id
      );

      // Cache already-imported filenames so we skip them
      const importedFiles = await prisma.importedFile.findMany({
        select: { filename: true },
      });
      const importedFilenames = new Set(importedFiles.map((f) => f.filename));

      // Delete all records that were saved before the file-level import system existed
      // (sourceFile="" means they have no ImportedFile entry and are stale legacy data).
      // This ensures a clean slate so the per-file import produces the exact right counts.
      const legacyDeleted = await prisma.dropCowboyCampaignRecord.deleteMany({
        where: { sourceFile: "" },
      });
      if (legacyDeleted.count > 0) {
        logger.info(`🗑️  Deleted ${legacyDeleted.count} legacy records (sourceFile="") before re-import`);
      }

      // Group campaign-groups by source file. A single JSON file can contain
      // multiple campaigns. We must process ALL campaigns from a file before
      // marking it as imported — otherwise the first campaign marks the file
      // done and subsequent campaigns from the same file get skipped.
      const byFile = new Map();
      for (const campaign of campaignData) {
        const f = campaign.filename || '__no_file__';
        if (!byFile.has(f)) byFile.set(f, []);
        byFile.get(f).push(campaign);
      }

      for (const [sourceFile, fileCampaigns] of byFile) {
        // Skip entire file if already fully imported
        if (sourceFile !== '__no_file__' && importedFilenames.has(sourceFile)) {
          logger.debug(`   ⏭️  Skipping already-imported file: ${sourceFile}`);
          continue;
        }

        // Process every campaign group in this file
        for (const campaign of fileCampaigns) {
          const campaignId = campaign.campaignId;
          if (!campaignId || campaignId === 'unknown') {
            logger.warn(`   ⚠️  Skipping campaign with no campaignId: ${campaign.campaignName}`);
            continue;
          }

          // Resolve clientId
          let clientId = null;
          try {
            const existingCampaign = await prisma.dropCowboyCampaign.findUnique({
              where: { campaignId },
              select: { clientId: true },
            });
            if (existingCampaign?.clientId) {
              clientId = existingCampaign.clientId;
            } else {
              const campaignNameLower = campaign.campaignName.toLowerCase();
              const campaignNameNorm = campaignNameLower.replace(/[\s_\-]+/g, '');
              let matchedClient = sortedClients.find((c) =>
                campaignNameLower.startsWith(c.name.toLowerCase())
              );
              if (!matchedClient) {
                matchedClient = sortedClients.find((c) => {
                  const n = c.name.toLowerCase().replace(/[\s_\-]+/g, '');
                  return n.length >= 3 && campaignNameNorm.startsWith(n);
                });
              }
              if (!matchedClient) {
                matchedClient = sortedClients.find((c) => {
                  const w = c.name.split(/\s+/)[0].toLowerCase();
                  return w.length >= 3 && campaignNameLower.startsWith(w);
                });
              }
              if (!matchedClient) {
                matchedClient = sortedClients.find((c) => {
                  const sig = c.name.toLowerCase().split(/\s+/).find((w) => w.length >= 3);
                  return sig && campaignNameLower.includes(sig);
                });
              }
              if (matchedClient) clientId = matchedClient.id;
            }
          } catch (clientError) {
            logger.error(`   ⚠️  Error matching campaign to client: ${clientError.message}`);
          }

          // Upsert campaign
          await prisma.dropCowboyCampaign.upsert({
            where: { campaignId },
            update: { campaignName: campaign.campaignName, clientId, updatedAt: new Date() },
            create: { campaignName: campaign.campaignName, campaignId, clientId, recordCount: 0 },
          });

          // Insert ALL records — no dedup, no filtering
          const records = campaign.records;
          const batchSize = 500;
          for (let i = 0; i < records.length; i += batchSize) {
            const batch = records.slice(i, i + batchSize);
            await prisma.dropCowboyCampaignRecord.createMany({
              data: batch.map((record) => {
                let dateValue = null;
                if (record.date && record.date.trim() !== "") {
                  try {
                    const d = new Date(record.date);
                    if (!isNaN(d.getTime())) dateValue = d;
                  } catch (_) {}
                }
                return {
                  campaignId: record.campaignId,
                  campaignName: record.campaignName,
                  phoneNumber: record.phoneNumber,
                  carrier: record.carrier || "",
                  lineType: record.lineType || "",
                  status: record.status || "",
                  statusCode: record.statusCode || 0,
                  statusReason: record.statusReason || null,
                  date: dateValue,
                  callbacks: record.callbacks || 0,
                  smsCount: record.smsCount || 0,
                  cost: new Prisma.Decimal(record.cost || 0),
                  complianceFee: new Prisma.Decimal(record.complianceFee || 0),
                  ttsFee: new Prisma.Decimal(record.ttsFee || 0),
                  firstName: record.firstName || "",
                  lastName: record.lastName || "",
                  company: record.company || "",
                  email: record.email || "",
                  recordId: record.recordId || null,
                  sourceFile: record.sourceFile || "",
                };
              }),
            });
            totalRecordsInserted += batch.length;
          }

          logger.debug(`     ✓ ${campaign.campaignName} → ${records.length} records`);
        }

        // Mark the whole file as imported AFTER all its campaigns are done
        if (sourceFile !== '__no_file__') {
          await prisma.importedFile.create({ data: { filename: sourceFile } });
          importedFilenames.add(sourceFile);
          logger.debug(`   ✅ File imported: ${sourceFile}`);
        }
      }

      // Update recordCount on all affected campaigns
      const campaignIds = [...new Set(campaignData.map((c) => c.campaignId).filter(Boolean))];
      for (const cid of campaignIds) {
        const count = await prisma.dropCowboyCampaignRecord.count({ where: { campaignId: cid } });
        await prisma.dropCowboyCampaign.update({
          where: { campaignId: cid },
          data: { recordCount: count },
        });
      }

      logger.debug(`✅ Total records inserted: ${totalRecordsInserted}`);

      const metrics = await this.getMetrics();
      return metrics;
    } catch (error) {
      logger.error("Error saving campaign data:", error);
      throw error;
    }
  }

  async getMetrics(filters = {}) {
    try {
      logger.debug('Fetching DropCowboy metrics with filters:', filters);
      
      // Build where clause for filters
      const whereClause = {};

      if (filters.campaignName) {
        whereClause.campaignName = {
          contains: filters.campaignName,
        };
      }

      // Filter by specific campaign IDs (for client-specific dashboards)
      if (filters.campaignIds && Array.isArray(filters.campaignIds)) {
        whereClause.campaignId = {
          in: filters.campaignIds,
        };
      } else if (filters.clientNames && Array.isArray(filters.clientNames)) {
        // Filter by accessible client names (for non-full-access users)
        const clientIds = await prisma.client.findMany({
          where: { 
            name: { in: filters.clientNames },
            clientType: "mautic" 
          },
          select: { id: true }
        });
        
        const mauticClientIds = clientIds.map(c => c.id);
        
        if (mauticClientIds.length > 0) {
          const accessibleCampaigns = await prisma.dropCowboyCampaign.findMany({
            where: { clientId: { in: mauticClientIds } },
            select: { campaignId: true }
          });
          whereClause.campaignId = { in: accessibleCampaigns.map(c => c.campaignId) };
        } else {
          // No accessible clients - return empty result
          logger.debug('No accessible clients found for user');
          whereClause.campaignId = { in: [] };
        }
      } else {
        // ALWAYS filter to only show campaigns linked to Mautic clients (unless specific campaignIds provided)
        // Get all Mautic client IDs
        const mauticClients = await prisma.client.findMany({
          where: { clientType: "mautic" },
          select: { id: true },
        });

        const mauticClientIds = mauticClients.map((c) => c.id);

        // Get campaigns linked ONLY to Mautic clients
        const mauticLinkedCampaigns = await prisma.dropCowboyCampaign.findMany({
          where: {
            clientId: { in: mauticClientIds },
          },
          select: { campaignId: true },
        });

        const mauticCampaignIds = mauticLinkedCampaigns.map((c) => c.campaignId);

        // Filter campaigns to only those linked to Mautic clients
        whereClause.campaignId = { in: mauticCampaignIds };
      }

      // Get campaigns with client information
      const campaigns = await prisma.dropCowboyCampaign.findMany({
        where: whereClause,
        include: {
          client: {
            select: {
              name: true,
            },
          },
        },
      });

      // For each campaign, calculate metrics
      const campaignsWithDetails = await Promise.all(
        campaigns.map(async (campaign) => {
          // Build record filters
          const recordWhere = {
            campaignId: campaign.campaignId,
          };

          if (filters.startDate) {
            // Convert YYYY-MM-DD to ISO-8601 DateTime (start of day)
            recordWhere.date = {
              gte: new Date(filters.startDate + "T00:00:00.000Z"),
            };
          }
          if (filters.endDate) {
            // Convert YYYY-MM-DD to ISO-8601 DateTime (end of day)
            recordWhere.date = {
              ...recordWhere.date,
              lte: new Date(filters.endDate + "T23:59:59.999Z"),
            };
          }

          // Get total count of records for accurate metrics (no limit)
          const totalSent = await prisma.dropCowboyCampaignRecord.count({
            where: recordWhere,
          });

          // Get records for display (no limit - pagination handled at API level)
          const records = await prisma.dropCowboyCampaignRecord.findMany({
            where: recordWhere,
            orderBy: { createdAt: "desc" },
          });

          // Calculate metrics from full aggregate (for accurate stats)
          const metricsAgg = await prisma.dropCowboyCampaignRecord.aggregate({
            where: recordWhere,
            _count: true,
            _sum: {
              cost: true,
              complianceFee: true,
              ttsFee: true,
            },
          });

          const successCount = await prisma.dropCowboyCampaignRecord.count({
            where: {
              ...recordWhere,
              status: {
                in: [
                  "sent",
                  "success",
                  "delivered",
                ],
              },
            },
          });

          const failureCount = await prisma.dropCowboyCampaignRecord.count({
            where: {
              ...recordWhere,
              status: {
                in: ["failed", "failure", "error"],
              },
            },
          });

          const otherStatusCount = await prisma.dropCowboyCampaignRecord.count({
            where: {
              ...recordWhere,
              status: {
                notIn: [
                  "sent",
                  "success",
                  "delivered",
                  "failed",
                  "failure",
                  "error"
                ],
              },
            },
          });

          const successfulDeliveries = successCount;
          const failedSends = failureCount;
          const otherStatus = otherStatusCount;
          const totalCost =
            parseFloat(metricsAgg._sum.cost || 0) +
            parseFloat(metricsAgg._sum.complianceFee || 0) +
            parseFloat(metricsAgg._sum.ttsFee || 0);

          const successRate =
            totalSent > 0
              ? ((successfulDeliveries / totalSent) * 100).toFixed(2)
              : 0;

          // Get carrier distribution
          const carriers = await prisma.dropCowboyCampaignRecord.groupBy({
            by: ["carrier"],
            where: { ...recordWhere, carrier: { not: "" } },
            _count: true,
          });

          const carrierDistribution = {};
          carriers.forEach((c) => {
            carrierDistribution[c.carrier || "Unknown"] = c._count;
          });

          // Get line type distribution
          const lineTypes = await prisma.dropCowboyCampaignRecord.groupBy({
            by: ["lineType"],
            where: { ...recordWhere, lineType: { not: "" } },
            _count: true,
          });

          const lineTypeDistribution = {};
          lineTypes.forEach((l) => {
            lineTypeDistribution[l.lineType || "Unknown"] = l._count;
          });

          // Get date range
          const dateRange =
            records.length > 0
              ? {
                  start: records[records.length - 1].date,
                  end: records[0].date,
                }
              : { start: null, end: null };

          return {
            campaignName: campaign.campaignName,
            campaignId: campaign.campaignId,
            client: campaign.client?.name || null,
            totalSent,
            successfulDeliveries,
            failedSends,
            otherStatus,
            pendingSends: 0, // Deprecated
            successRate: parseFloat(successRate),
            totalCost: parseFloat(totalCost.toFixed(4)),
            averageCost:
              totalSent > 0
                ? parseFloat((totalCost / totalSent).toFixed(4))
                : 0,
            carriers: carrierDistribution,
            lineTypes: lineTypeDistribution,
            dateRange,
            records: records.map((r) => ({
              campaignName: r.campaignName,
              campaignId: r.campaignId,
              phoneNumber: r.phoneNumber,
              carrier: r.carrier,
              lineType: r.lineType,
              status: r.status,
              statusCode: r.statusCode,
              statusReason: r.statusReason,
              date: r.date,
              callbacks: r.callbacks,
              smsCount: r.smsCount,
              cost: parseFloat(r.cost),
              complianceFee: parseFloat(r.complianceFee),
              ttsFee: parseFloat(r.ttsFee),
              firstName: r.firstName,
              lastName: r.lastName,
              company: r.company,
              email: r.email,
              recordId: r.recordId,
            })),
          };
        })
      );

      // Calculate overall metrics
      // Build record-level where clause that matches the campaign filter
      const recordWhereClause = {};
      
      if (whereClause.campaignId) {
        // If campaigns are filtered by IDs, filter records by those campaign IDs
        recordWhereClause.campaignId = whereClause.campaignId;
      }

      const overallAgg = await prisma.dropCowboyCampaignRecord.aggregate({
        where: recordWhereClause,
        _count: true,
        _sum: {
          cost: true,
          complianceFee: true,
          ttsFee: true,
        },
      });

      const totalSent = overallAgg._count || 0;
      const totalCost =
        parseFloat(overallAgg._sum.cost || 0) +
        parseFloat(overallAgg._sum.complianceFee || 0) +
        parseFloat(overallAgg._sum.ttsFee || 0);

      // Get success/failure counts
      const successCount = await prisma.dropCowboyCampaignRecord.count({
        where: {
          ...recordWhereClause,
          status: {
            in: [
              "sent",
              "success",
              "delivered",
              "SENT",
              "SUCCESS",
              "DELIVERED",
            ],
          },
        },
      });

      const failureCount = await prisma.dropCowboyCampaignRecord.count({
        where: {
          ...recordWhereClause,
          status: {
            in: ["failed", "failure", "error", "FAILED", "FAILURE", "ERROR"],
          },
        },
      });

      const otherStatusCount = await prisma.dropCowboyCampaignRecord.count({
        where: {
          ...recordWhereClause,
          status: {
            notIn: [
              "sent",
              "success",
              "delivered",
              "failed",
              "failure",
              "error",
              "SENT",
              "SUCCESS",
              "DELIVERED",
              "FAILED",
              "FAILURE",
              "ERROR"
            ],
          },
        },
      });

      const averageSuccessRate =
        totalSent > 0 ? ((successCount / totalSent) * 100).toFixed(2) : 0;

      // Get last sync time
      const lastSync = await prisma.syncLog.findFirst({
        where: { status: "success" },
        orderBy: { syncCompletedAt: "desc" },
      });
      return {
        campaigns: campaignsWithDetails,
        overall: {
          totalCampaigns: campaigns.length,
          totalSent,
          successfulDeliveries: successCount,
          failedSends: failureCount,
          otherStatus: otherStatusCount,
          totalCost: parseFloat(totalCost.toFixed(4)),
          averageSuccessRate: parseFloat(averageSuccessRate),
        },
        lastUpdated:
          lastSync?.syncCompletedAt?.toISOString() || new Date().toISOString(),
      };
    } catch (error) {
      logger.error("Error getting DropCowboy metrics:", {
        error: error.message,
        stack: error.stack,
        filters
      });
      // Return empty data structure on error
      return {
        campaigns: [],
        overall: {
          totalCampaigns: 0,
          totalSent: 0,
          successfulDeliveries: 0,
          failedSends: 0,
          otherStatus: 0,
          totalCost: 0,
          averageSuccessRate: 0,
        },
        lastUpdated: null,
      };
    }
  }

  async logSync(status, details = {}) {
    try {
      // Truncate error message to fit database column (max 500 chars to be safe)
      const errorMessage = details.error
        ? details.error.length > 500
          ? details.error.substring(0, 497) + "..."
          : details.error
        : null;

      await prisma.syncLog.create({
        data: {
          source: 'dropcowboy',
          syncType: details.type || "manual",
          status: status,
          filesDownloaded: details.filesDownloaded || 0,
          campaignsProcessed: details.campaignsProcessed || 0,
          totalRecords: details.totalRecords || 0,
          errorMessage: errorMessage,
          syncCompletedAt: new Date(),
        },
      });
    } catch (error) {
      logger.error("Error logging sync:", error);
    }
  }

  async getSyncLogs(limit = 20) {
    try {
      const logs = await prisma.syncLog.findMany({
        take: limit,
        orderBy: { syncStartedAt: "desc" },
      });

      // Format logs for frontend
      return logs.map((log) => ({
        timestamp: log.syncStartedAt,
        status: log.status,
        type: log.syncType,
        filesDownloaded: log.filesDownloaded,
        campaignsProcessed: log.campaignsProcessed,
        totalRecords: log.totalRecords,
        error: log.errorMessage,
      }));
    } catch (error) {
      logger.error("Error fetching sync logs:", error);
      return [];
    }
  }

  async getPaginatedRecords(filters = {}) {
    try {
      const where = {};

      // Search filter
      if (filters.q) {
        where.OR = [
          { phoneNumber: { contains: filters.q } },
          { firstName: { contains: filters.q } },
          { lastName: { contains: filters.q } },
          { email: { contains: filters.q } },
          { campaignName: { contains: filters.q } },
        ];
      }

      // Campaign name filter
      if (filters.campaignName) {
        where.campaignName = { contains: filters.campaignName };
      }

      // Date range filters
      if (filters.startDate) {
        // Convert YYYY-MM-DD string to Date object (start of day in UTC)
        const startDate = new Date(filters.startDate + "T00:00:00.000Z");
        where.date = { gte: startDate };
        logger.debug(
          `🔍 Date filter - startDate: ${
            filters.startDate
          } → ${startDate.toISOString()}`
        );
      }
      if (filters.endDate) {
        // Convert YYYY-MM-DD string to Date object (end of day in UTC)
        const endDate = new Date(filters.endDate + "T23:59:59.999Z");
        where.date = { ...where.date, lte: endDate };
        logger.debug(
          `🔍 Date filter - endDate: ${
            filters.endDate
          } → ${endDate.toISOString()}`
        );
      }

      // 🚀 OPTIMIZED: Use cached Mautic client IDs and campaign mappings
      let mauticCampaignIds;
      
      // Check if cached data is still valid (within TTL)
      const now = Date.now();
      const cacheValid = cache.campaignMappings.data && 
                         cache.campaignMappings.timestamp && 
                         (now - cache.campaignMappings.timestamp) < cache.campaignMappings.ttl;

      if (cacheValid) {
        // Use cached campaign IDs
        mauticCampaignIds = cache.campaignMappings.data;
        logger.debug(`✅ Using cached campaign mappings (${mauticCampaignIds.length} campaigns)`);
      } else {
        // Fetch and cache Mautic client IDs and campaign mappings
        const mauticClients = await prisma.client.findMany({
          where: { clientType: "mautic" },
          select: { id: true },
        });

        const mauticClientIds = mauticClients.map((c) => c.id);
        cache.mauticClientIds.data = mauticClientIds;
        cache.mauticClientIds.timestamp = now;

        // Get campaigns linked ONLY to Mautic clients
        const mauticLinkedCampaigns = await prisma.dropCowboyCampaign.findMany({
          where: {
            clientId: { in: mauticClientIds },
          },
          select: { campaignId: true },
        });

        mauticCampaignIds = mauticLinkedCampaigns.map((c) => c.campaignId);
        cache.campaignMappings.data = mauticCampaignIds;
        cache.campaignMappings.timestamp = now;
        
        logger.debug(`🔄 Cached campaign mappings refreshed (${mauticCampaignIds.length} campaigns)`);
      }

      // Base filter: always include only Mautic campaign IDs
      let allowedCampaignIds = mauticCampaignIds;

      // Apply clientIds filter (for access control - multiple clients)
      // Note: clientIds might be MauticClient IDs from frontend, so we need to map them to Client IDs
      if (filters.clientIds && filters.clientIds.length > 0) {
        // Map MauticClient IDs to Client IDs
        const mauticClients = await prisma.mauticClient.findMany({
          where: { id: { in: filters.clientIds } },
          select: { id: true, clientId: true }
        });
        
        // Extract Client IDs (filter out null values)
        const mappedClientIds = mauticClients
          .map(mc => mc.clientId)
          .filter(Boolean);
        
        // If no valid Client IDs found, use the original IDs (they might already be Client IDs)
        const clientIdsToUse = mappedClientIds.length > 0 ? mappedClientIds : filters.clientIds;
        
        const clientCampaigns = await prisma.dropCowboyCampaign.findMany({
          where: { clientId: { in: clientIdsToUse } },
          select: { campaignId: true },
        });

        const accessibleCampaignIds = clientCampaigns.map((c) => c.campaignId);
        // Intersect with Mautic campaigns (only campaigns that are both Mautic AND accessible)
        allowedCampaignIds = mauticCampaignIds.filter(id => accessibleCampaignIds.includes(id));
      }

      // Apply specific client filter if specified (further narrows down the results)
      if (filters.client) {
        const client = await prisma.client.findFirst({
          where: { name: filters.client, clientType: "mautic" },
        });

        if (client) {
          const clientCampaigns = await prisma.dropCowboyCampaign.findMany({
            where: { clientId: client.id },
            select: { campaignId: true },
          });

          const specificClientCampaignIds = clientCampaigns.map((c) => c.campaignId);
          // Intersect with previously allowed campaigns (AND logic)
          allowedCampaignIds = allowedCampaignIds.filter(id => specificClientCampaignIds.includes(id));
        } else {
          // Client not found, return empty results
          allowedCampaignIds = [];
        }
      }

      // Set the final filter
      where.campaignId = { in: allowedCampaignIds };

      // Status filter
      if (filters.status && filters.status !== "all") {
        const status = filters.status.toLowerCase();
        if (status === "success") {
          where.status = {
            in: [
              "sent",
              "success",
              "delivered",
              "SENT",
              "SUCCESS",
              "DELIVERED",
            ],
          };
        } else if (status === "failed") {
          where.status = {
            in: ["failed", "failure", "error", "FAILED", "FAILURE", "ERROR"],
          };
        } else if (status === "other") {
          where.status = {
            notIn: [
              "sent",
              "success",
              "delivered",
              "failed",
              "failure",
              "error",
              "SENT",
              "SUCCESS",
              "DELIVERED",
              "FAILED",
              "FAILURE",
              "ERROR",
            ],
          };
        } else {
          where.status = status;
        }
      }

      // Get total count
      const total = await prisma.dropCowboyCampaignRecord.count({ where });
      logger.debug(
        `📊 Filtered records count: ${total} records matching criteria`
      );
      if (filters.startDate || filters.endDate) {
        logger.debug(
          `📅 Date range applied: ${filters.startDate || "any"} to ${
            filters.endDate || "any"
          }`
        );
      }

      // Calculate filtered metrics for voicemail campaign records
      const [successCount, failedCount, otherStatusCount, costAggregates] = await Promise.all([
        // Count successful deliveries
        prisma.dropCowboyCampaignRecord.count({
          where: {
            ...where,
            status: {
              in: [
                "sent",
                "success",
                "delivered",
                "SENT",
                "SUCCESS",
                "DELIVERED",
              ],
            },
          },
        }),
        // Count failed deliveries
        prisma.dropCowboyCampaignRecord.count({
          where: {
            ...where,
            status: {
              in: ["failed", "failure", "error", "FAILED", "FAILURE", "ERROR"],
            },
          },
        }),
        // Count other statuses
        prisma.dropCowboyCampaignRecord.count({
          where: {
            ...where,
            status: {
              notIn: [
                "sent",
                "success",
                "delivered",
                "failed",
                "failure",
                "error",
                "SENT",
                "SUCCESS",
                "DELIVERED",
                "FAILED",
                "FAILURE",
                "ERROR",
              ],
            },
          },
        }),
        // Calculate total cost
        prisma.dropCowboyCampaignRecord.aggregate({
          where,
          _sum: {
            cost: true,
            complianceFee: true,
            ttsFee: true,
          },
        }),
      ]);

      const otherStatus = otherStatusCount;
      const totalCost =
        parseFloat(costAggregates._sum.cost || 0) +
        parseFloat(costAggregates._sum.complianceFee || 0) +
        parseFloat(costAggregates._sum.ttsFee || 0);

      // Calculate percentages
      const deliveryRate =
        total > 0 ? ((successCount / total) * 100).toFixed(1) : 0;
      const failureRate =
        total > 0 ? ((failedCount / total) * 100).toFixed(1) : 0;
      const otherStatusRate =
        total > 0 ? ((otherStatusCount / total) * 100).toFixed(1) : 0;

      // Get paginated records
      const limit = filters.limit ? parseInt(filters.limit) : 50;
      const offset = filters.offset ? parseInt(filters.offset) : 0;

      const records = await prisma.dropCowboyCampaignRecord.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: { createdAt: "desc" },
        include: {
          campaign: {
            include: {
              client: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      });

      return {
        total,
        metrics: {
          totalVoicemailsSent: total,
          successfulDeliveries: successCount,
          deliveryRate: parseFloat(deliveryRate),
          failedDeliveries: failedCount,
          failureRate: parseFloat(failureRate),
          otherStatus: otherStatusCount,
          otherStatusRate: parseFloat(otherStatusRate),
          totalCampaignCost: parseFloat(totalCost.toFixed(4)),
        },
        records: records.map((r) => ({
          campaignName: r.campaignName,
          campaignId: r.campaignId,
          client: r.campaign?.client?.name || null,
          clientId: r.campaign?.client?.id || null,
          phoneNumber: r.phoneNumber,
          carrier: r.carrier,
          lineType: r.lineType,
          status: r.status,
          statusCode: r.statusCode,
          statusReason: r.statusReason,
          date: r.date,
          callbacks: r.callbacks,
          smsCount: r.smsCount,
          cost: parseFloat(r.cost),
          complianceFee: parseFloat(r.complianceFee),
          ttsFee: parseFloat(r.ttsFee),
          firstName: r.firstName,
          lastName: r.lastName,
          company: r.company,
          email: r.email,
          recordId: r.recordId,
        })),
      };
    } catch (error) {
      logger.error("Error getting paginated records:", error);
      return {
        total: 0,
        metrics: {
          totalVoicemailsSent: 0,
          successfulDeliveries: 0,
          deliveryRate: 0,
          failedDeliveries: 0,
          failureRate: 0,
          otherStatus: 0,
          otherStatusRate: 0,
          totalCampaignCost: 0,
        },
        records: [],
      };
    }
  }

  async getAllCampaigns() {
    try {
      const campaigns = await prisma.dropCowboyCampaign.findMany({
        select: {
          id: true,
          campaignId: true,
          campaignName: true,
          clientId: true,
          recordCount: true,
          isValid: true,
          createdAt: true,
          updatedAt: true,
          client: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: {
          campaignName: "asc",
        },
      });

      return campaigns;
    } catch (error) {
      logger.error("Error fetching all campaigns:", error);
      throw error;
    }
  }

  async linkCampaignToClient(campaignId, clientId) {
    try {
      // Verify client exists
      const client = await prisma.client.findUnique({
        where: { id: parseInt(clientId) },
      });

      if (!client) {
        throw new Error(`Client with ID ${clientId} not found`);
      }

      // Update campaign with clientId
      const updatedCampaign = await prisma.dropCowboyCampaign.update({
        where: { campaignId: campaignId },
        data: {
          clientId: parseInt(clientId),
        },
        include: {
          client: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      logger.debug(
        `✅ Campaign "${updatedCampaign.campaignName}" linked to client "${client.name}"`
      );

      return updatedCampaign;
    } catch (error) {
      logger.error("Error linking campaign to client:", error);
      throw error;
    }
  }

  async unlinkCampaignFromClient(campaignId) {
    try {
      const updatedCampaign = await prisma.dropCowboyCampaign.update({
        where: { campaignId: campaignId },
        data: {
          clientId: null,
        },
      });

      logger.debug(
        `✅ Campaign "${updatedCampaign.campaignName}" unlinked from client`
      );

      return updatedCampaign;
    } catch (error) {
      logger.error("Error unlinking campaign from client:", error);
      throw error;
    }
  }

  /**
   * Rebuild missing campaigns from existing records and re-link to clients
   * This repairs data when campaigns weren't created during sync
   */
  async rebuildCampaignsFromRecords() {
    try {
      logger.info("🔧 Rebuilding campaigns from existing records...");

      // Get all distinct campaigns from records that don't have a campaign entry
      const distinctCampaigns = await prisma.dropCowboyCampaignRecord.findMany({
        distinct: ["campaignId"],
        select: {
          campaignId: true,
          campaignName: true,
        },
      });

      // Get Mautic clients for matching
      const mauticClients = await prisma.client.findMany({
        where: { clientType: "mautic" },
      });
      const sortedClients = mauticClients.sort((a, b) => b.name.length - a.name.length);

      let created = 0;
      let linked = 0;

      for (const campaign of distinctCampaigns) {
        // Check if campaign already exists
        const existing = await prisma.dropCowboyCampaign.findUnique({
          where: { campaignId: campaign.campaignId },
        });

        const campaignNameLower = campaign.campaignName.toLowerCase();

        // Match client using same logic as saveCampaignData
        let matchedClient = sortedClients.find((client) =>
          campaignNameLower.startsWith(client.name.toLowerCase())
        );

        if (!matchedClient) {
          matchedClient = sortedClients.find((client) => {
            const firstWord = client.name.split(/\s+/)[0].toLowerCase();
            return firstWord.length >= 3 && campaignNameLower.startsWith(firstWord);
          });
        }

        if (!matchedClient) {
          matchedClient = sortedClients.find((client) => {
            const clientWords = client.name.toLowerCase().split(/\s+/);
            const significantWord = clientWords.find(word => word.length >= 3);
            return significantWord && campaignNameLower.includes(significantWord);
          });
        }

        const clientId = matchedClient ? matchedClient.id : null;

        // Get record count
        const recordCount = await prisma.dropCowboyCampaignRecord.count({
          where: { campaignId: campaign.campaignId },
        });

        if (!existing) {
          // Create new campaign
          await prisma.dropCowboyCampaign.create({
            data: {
              campaignId: campaign.campaignId,
              campaignName: campaign.campaignName,
              clientId: clientId,
              recordCount: recordCount,
            },
          });
          created++;
          if (clientId) linked++;
          logger.debug(`   ✅ Created campaign: ${campaign.campaignName} (${recordCount} records) → ${matchedClient?.name || "unlinked"}`);
        } else if (!existing.clientId && clientId) {
          // Update existing campaign with client link
          await prisma.dropCowboyCampaign.update({
            where: { campaignId: campaign.campaignId },
            data: { clientId: clientId, recordCount: recordCount },
          });
          linked++;
          logger.debug(`   🔗 Linked existing campaign: ${campaign.campaignName} → ${matchedClient.name}`);
        } else {
          // Just update record count
          await prisma.dropCowboyCampaign.update({
            where: { campaignId: campaign.campaignId },
            data: { recordCount: recordCount },
          });
        }
      }

      logger.info(`✅ Rebuild complete: ${created} campaigns created, ${linked} campaigns linked to clients`);

      return {
        success: true,
        campaignsCreated: created,
        campaignsLinked: linked,
        totalCampaigns: distinctCampaigns.length,
      };
    } catch (error) {
      logger.error("❌ Error rebuilding campaigns:", error);
      throw error;
    }
  }

  /**
   * Clear all DropCowboy data from database
   * This includes campaigns, records, and imported files tracking
   */
  async clearAllDropCowboyData() {
    try {
      logger.debug("🗑️  Clearing all DropCowboy data from database...");

      // Delete in correct order due to foreign key constraints
      // 1. Delete campaign records first (child table)
      const deletedRecords = await prisma.dropCowboyCampaignRecord.deleteMany(
        {}
      );
      logger.debug(`   ✅ Deleted ${deletedRecords.count} campaign records`);

      // 2. Delete campaigns
      const deletedCampaigns = await prisma.dropCowboyCampaign.deleteMany({});
      logger.debug(`   ✅ Deleted ${deletedCampaigns.count} campaigns`);

      // 3. Delete imported files tracking
      const deletedImportedFiles = await prisma.importedFile.deleteMany({});

      logger.debug("✅ All DropCowboy data cleared successfully");

      return {
        success: true,
        recordsDeleted: deletedRecords.count,
        campaignsDeleted: deletedCampaigns.count,
        importedFilesDeleted: deletedImportedFiles.count,
      };
    } catch (error) {
      logger.error("❌ Error clearing DropCowboy data:", error);
      throw error;
    }
  }

  /**
   * Get available clients that have DropCowboy campaigns
   * @param {Number[]} clientIds - Optional array of accessible client IDs (might be MauticClient IDs or Client IDs)
   * @returns {Promise<String[]>} Array of unique client names
   */
  async getAvailableClients(clientIds = null) {
    try {
      const where = {};
      
      // If clientIds provided, map them from MauticClient IDs to Client IDs
      if (clientIds && clientIds.length > 0) {
        // Try to map MauticClient IDs to Client IDs
        const mauticClients = await prisma.mauticClient.findMany({
          where: { id: { in: clientIds } },
          select: { id: true, clientId: true }
        });
        
        // Extract Client IDs (filter out null values)
        const mappedClientIds = mauticClients
          .map(mc => mc.clientId)
          .filter(Boolean);
        
        // If no valid Client IDs found, use the original IDs (they might already be Client IDs)
        const clientIdsToUse = mappedClientIds.length > 0 ? mappedClientIds : clientIds;
        
        where.clientId = { in: clientIdsToUse };
      }

      // Get distinct clients from campaigns
      const campaigns = await prisma.dropCowboyCampaign.findMany({
        where,
        distinct: ['clientId'],
        select: {
          clientId: true,
          client: {
            select: { name: true }
          }
        }
      });

      // Extract and sort client names
      const clientNames = campaigns
        .filter(c => c.client?.name)
        .map(c => c.client.name)
        .sort((a, b) => a.localeCompare(b));

      return clientNames;
    } catch (error) {
      logger.error("Error fetching available clients:", error);
      return [];
    }
  }
}

export default DataService;
