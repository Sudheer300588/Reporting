import logger from '../../../utils/logger.js';
import { format, parseISO, isWithinInterval } from "date-fns";
import prisma from "../../../prisma/client.js";
import { Prisma } from "@prisma/client";
import { ca } from "zod/v4/locales";
import { cli } from "winston/lib/winston/config/index.js";

class DataService {
  async saveCampaignData(campaignData) {
    try {
      logger.debug(`💾 Saving ${campaignData.length} campaigns to database...`);
      let totalRecordsInserted = 0;

      // Get already imported files
      const importedFiles = await prisma.importedFile.findMany({
        select: { filename: true },
      });
      const importedFilenames = new Set(importedFiles.map((f) => f.filename));

      for (const campaign of campaignData) {
        // If this file was already imported, skip
        if (importedFilenames.has(campaign.filename)) {
          logger.debug(
            `   ⏩ Skipping already imported file: ${campaign.filename}`
          );
          continue;
        }

        // Extract campaign ID from records
        const campaignId = campaign.records[0]?.campaignId || "unknown";

        // ONLY match to Mautic clients (do NOT auto-create dropcowboy clients)
        let clientId = null;
        try {
          // Check if a client already exists for this campaign
          const existingCampaign = await prisma.dropCowboyCampaign.findUnique({
            where: { campaignId },
            select: { clientId: true },
          });

          if (existingCampaign?.clientId) {
            clientId = existingCampaign.clientId;
          } else {
            // ONLY get Mautic clients (clientType: "mautic")
            const mauticClients = await prisma.client.findMany({
              where: { clientType: "mautic" },
            });

            // Sort by name length (longest first) to avoid "JAE" matching before "JAE Automation"
            const sortedClients = mauticClients.sort((a, b) => b.name.length - a.name.length);

            // Find the first Mautic client that matches the campaign name prefix
            let matchedClient = sortedClients.find((client) =>
              campaign.campaignName.startsWith(client.name)
            );

            if (matchedClient) {
              clientId = matchedClient.id;
              logger.debug(
                `ℹ️ Matched Mautic client: ${matchedClient.name} (ID: ${clientId})`
              );
            } else {
              // No Mautic client matched - set clientId to null (do NOT create dropcowboy client)
              logger.debug(
                `⚠️  No Mautic client matched for campaign: ${campaign.campaignName}`
              );
            }
          }
        } catch (clientError) {
          logger.error(
            `   ⚠️  Error matching campaign to client: ${clientError.message}`
          );
        }

        // Create or update campaign
        await prisma.dropCowboyCampaign.upsert({
          where: { campaignId },
          update: {
            campaignName: campaign.campaignName,
            clientId: clientId,
            updatedAt: new Date(),
          },
          create: {
            campaignName: campaign.campaignName,
            campaignId,
            clientId: clientId,
          },
        });

        logger.debug(
          `   ✓ Campaign: ${campaign.campaignName} (${campaign.recordCount} records)`
        );

        // OPTIMIZED: Use IN clause for bulk lookup (much faster than OR)
        const uniquePhoneNumbers = [
          ...new Set(campaign.records.map((r) => r.phoneNumber)),
        ];
        // Filter out invalid dates (empty strings, null, undefined)
        const uniqueDates = [
          ...new Set(
            campaign.records
              .map((r) => r.date)
              .filter((d) => d && d.trim() !== "")
          ),
        ];

        logger.debug(
          `     - Checking ${uniquePhoneNumbers.length} unique phones × ${uniqueDates.length} unique dates`
        );

        // Fetch existing records using IN clauses (MySQL optimized)
        const existingRecords = await prisma.dropCowboyCampaignRecord.findMany({
          where: {
            campaignId: campaignId,
            phoneNumber: { in: uniquePhoneNumbers },
            date: uniqueDates.length > 0 ? { in: uniqueDates } : undefined,
          },
          select: {
            campaignId: true,
            phoneNumber: true,
            date: true,
          },
        });

        // Helper function to parse dates consistently
        const parseDate = (dateStr) => {
          if (!dateStr || dateStr.trim() === "") return null;
          try {
            const parsed = new Date(dateStr);
            return isNaN(parsed.getTime()) ? null : parsed.toISOString();
          } catch (e) {
            return null;
          }
        };

        // Create Set of existing composite keys for O(1) lookup
        const existingKeys = new Set(
          existingRecords.map(
            (r) =>
              `${r.campaignId}|${r.phoneNumber}|${
                r.date ? new Date(r.date).toISOString() : "null"
              }`
          )
        );

        // Filter out duplicates using Set lookup (O(n) complexity)
        const newRecords = campaign.records.filter((record) => {
          const parsedDate = parseDate(record.date);
          const key = `${record.campaignId}|${record.phoneNumber}|${
            parsedDate || "null"
          }`;
          return !existingKeys.has(key);
        });

        logger.debug(
          `     - Found ${existingRecords.length} existing records, inserting ${newRecords.length} new records`
        );

        // Bulk insert new records in batches of 500
        const batchSize = 500;
        for (let i = 0; i < newRecords.length; i += batchSize) {
          const batch = newRecords.slice(i, i + batchSize);

          if (batch.length > 0) {
            await prisma.dropCowboyCampaignRecord.createMany({
              data: batch.map((record) => {
                // Parse date properly - convert to Date or null
                let dateValue = null;
                if (record.date && record.date.trim() !== "") {
                  try {
                    dateValue = new Date(record.date);
                    // Check if date is valid
                    if (isNaN(dateValue.getTime())) {
                      dateValue = null;
                    }
                  } catch (e) {
                    dateValue = null;
                  }
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
                };
              }),
              skipDuplicates: true,
            });

            totalRecordsInserted += batch.length;

            if (newRecords.length > batchSize) {
              logger.debug(
                `     - Inserted ${Math.min(
                  i + batchSize,
                  newRecords.length
                )}/${newRecords.length} records`
              );
            }
          }
        }

        // Mark file as imported
        await prisma.importedFile.upsert({
          where: { filename: campaign.filename },
          update: { importedAt: new Date() },
          create: { filename: campaign.filename },
        });
      }

      logger.debug(`✅ Total records inserted: ${totalRecordsInserted}`);

      // Get aggregated metrics from database
      const metrics = await this.getMetrics();
      return metrics;
    } catch (error) {
      logger.error("Error saving campaign data:", error);
      throw error;
    }
  }

  async getMetrics(filters = {}) {
    try {
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
                  "SENT",
                  "SUCCESS",
                  "DELIVERED",
                ],
              },
            },
          });

          const failureCount = await prisma.dropCowboyCampaignRecord.count({
            where: {
              ...recordWhere,
              status: {
                in: ["failed", "failure", "error", "FAILED", "FAILURE", "ERROR"],
              },
            },
          });

          const successfulDeliveries = successCount;
          const failedSends = failureCount;
          const otherStatus = totalSent - successfulDeliveries - failedSends;

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
      const overallAgg = await prisma.dropCowboyCampaignRecord.aggregate({
        where: whereClause,
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
          ...whereClause,
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
          ...whereClause,
          status: {
            in: ["failed", "failure", "error", "FAILED", "FAILURE", "ERROR"],
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
          otherStatus: totalSent - successCount - failureCount,
          totalCost: parseFloat(totalCost.toFixed(4)),
          averageSuccessRate: parseFloat(averageSuccessRate),
        },
        lastUpdated:
          lastSync?.syncCompletedAt?.toISOString() || new Date().toISOString(),
      };
    } catch (error) {
      logger.error("Error getting metrics:", error);
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

      // ALWAYS filter to only show campaigns linked to Mautic clients
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

      // Base filter: always include only Mautic campaign IDs
      where.campaignId = { in: mauticCampaignIds };

      // Apply client filter if specified
      if (filters.client) {
        const client = await prisma.client.findFirst({
          where: { name: filters.client, clientType: "mautic" },
        });

        if (client) {
          const clientCampaigns = await prisma.dropCowboyCampaign.findMany({
            where: { clientId: client.id },
            select: { campaignId: true },
          });

          const clientCampaignIds = clientCampaigns.map((c) => c.campaignId);
          where.campaignId = { in: clientCampaignIds };
        } else {
          // Client not found, return empty results
          where.campaignId = { in: [] };
        }
      }

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
      const [successCount, failedCount, costAggregates] = await Promise.all([
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

      const otherStatus = total - successCount - failedCount;
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
        total > 0 ? ((otherStatus / total) * 100).toFixed(1) : 0;

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
          otherStatus: otherStatus,
          otherStatusRate: parseFloat(otherStatusRate),
          totalCampaignCost: parseFloat(totalCost.toFixed(4)),
        },
        records: records.map((r) => ({
          campaignName: r.campaignName,
          campaignId: r.campaignId,
          client: r.campaign?.client?.name || null,
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
}

export default DataService;
