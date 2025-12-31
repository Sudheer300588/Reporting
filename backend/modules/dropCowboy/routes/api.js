import express from "express";
import SftpService from "../services/sftpService.js";
import DataService from "../services/dataService.js";
import logger from "../../../utils/logger.js";
import {
  notifySftpFetchCompleted,
  notifySftpFetchFailed,
} from "../../../utils/emailHelper.js";

const router = express.Router();
const sftpService = new SftpService();
const dataService = new DataService();

// Track ongoing sync operations
let isSyncInProgress = false;
let currentSyncStartTime = null;

// Get dashboard metrics with optional filters and pagination
router.get("/metrics", async (req, res) => {
  try {
    const { startDate, endDate, campaignName, campaignIds, page, limit } =
      req.query;

    const filters = {};
    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;
    if (campaignName) filters.campaignName = campaignName;
    if (campaignIds) {
      // Parse comma-separated campaign IDs
      filters.campaignIds = campaignIds.split(",").filter((id) => id.trim());
    }

    const metrics = await dataService.getMetrics(filters);

    // Apply pagination if requested
    let paginatedMetrics = { ...metrics };

    if (page && limit) {
      const pageNum = parseInt(page) || 1;
      const limitNum = parseInt(limit) || 1000;
      const offset = (pageNum - 1) * limitNum;

      // Paginate campaigns
      const totalCampaigns = metrics.campaigns.length;
      paginatedMetrics.campaigns = metrics.campaigns.slice(
        offset,
        offset + limitNum
      );

      // Add pagination metadata
      paginatedMetrics.pagination = {
        currentPage: pageNum,
        pageSize: limitNum,
        totalCampaigns: totalCampaigns,
        totalPages: Math.ceil(totalCampaigns / limitNum),
        hasMore: offset + limitNum < totalCampaigns,
      };
    }

    res.json({
      success: true,
      data: paginatedMetrics,
    });
  } catch (error) {
    logger.error("Error fetching DropCowboy metrics", { error: error.message });
    res.status(500).json({
      success: false,
      message: "Failed to fetch metrics",
      error: error.message,
    });
  }
});

// Manual fetch from SFTP
router.post("/fetch", async (req, res) => {
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

    logger.info("Starting manual SFTP fetch...");

    try {
      // Download files from SFTP
      const downloadResult = await sftpService.downloadAllFiles();

      if (!downloadResult.success) {
        throw new Error("Failed to download files from SFTP");
      }

      // Parse downloaded files
      const campaignData = await sftpService.parseLocalFiles();

      // Save and aggregate data
      const metrics = await dataService.saveCampaignData(campaignData);

      // Log the sync
      await dataService.logSync("success", {
        type: "manual",
        filesDownloaded: downloadResult.filesDownloaded,
        campaignsProcessed: campaignData.length,
        totalRecords: campaignData.reduce((sum, c) => sum + c.recordCount, 0),
      });

      logger.info("Manual SFTP fetch completed successfully", {
        filesDownloaded: downloadResult.filesDownloaded,
        campaignsProcessed: campaignData.length,
      });

      // Send email notification
      notifySftpFetchCompleted({
        filesDownloaded: downloadResult.filesDownloaded,
        campaignsProcessed: campaignData.length,
        totalRecords: campaignData.reduce((sum, c) => sum + c.recordCount, 0),
      }).catch((err) =>
        logger.error("Failed to send SFTP fetch completion email", {
          error: err.message,
        })
      );

      res.json({
        success: true,
        message:
          downloadResult.warning || "Data fetched and processed successfully",
        warning: downloadResult.warning,
        data: {
          filesDownloaded: downloadResult.filesDownloaded,
          campaignsProcessed: campaignData.length,
          metrics,
        },
      });
    } finally {
      // Always reset sync status
      isSyncInProgress = false;
      currentSyncStartTime = null;
    }
  } catch (error) {
    logger.error("Error during manual SFTP fetch", {
      error: error.message,
      stack: error.stack,
    });

    // Reset sync status on error
    isSyncInProgress = false;
    currentSyncStartTime = null;

    await dataService.logSync("failed", {
      type: "manual",
      error: error.message,
    });

    // Send email notification
    notifySftpFetchFailed(error).catch((err) =>
      logger.error("Failed to send SFTP fetch failure email", {
        error: err.message,
      })
    );

    res.status(500).json({
      success: false,
      message: "Failed to fetch data from SFTP",
      error: error.message,
      details: error.stack || error,
    });
  }
});

// Get sync status
router.get("/sync-status", (req, res) => {
  const elapsedSeconds = isSyncInProgress
    ? Math.floor((Date.now() - currentSyncStartTime) / 1000)
    : 0;

  res.json({
    success: true,
    data: {
      isSyncing: isSyncInProgress,
      elapsedTime: elapsedSeconds,
      startTime: currentSyncStartTime,
    },
  });
});

// Get sync logs
router.get("/sync-logs", async (req, res) => {
  try {
    let limit = parseInt(req.query.limit) || 20;

    // Validate limit
    if (isNaN(limit) || limit < 1) limit = 20;
    if (limit > 100) limit = 100; // Cap at 100

    const logs = await dataService.getSyncLogs(limit);

    res.json({
      success: true,
      data: logs,
    });
  } catch (error) {
    logger.error("Error fetching DropCowboy sync logs", {
      error: error.message,
    });
    res.status(500).json({
      success: false,
      message: "Failed to fetch sync logs",
      error: error.message,
    });
  }
});

// Get paginated records from all campaigns
router.get("/records", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const status = req.query.status;
    const search = req.query.q || req.query.search;
    const client = req.query.client;
    const startDate = req.query.startDate;
    const endDate = req.query.endDate;

    const offset = (page - 1) * limit;

    const filters = {
      q: search,
      client,
      status,
      startDate,
      endDate,
      limit,
      offset,
    };

    const result = await dataService.getPaginatedRecords(filters);

    const totalRecords = result.total || 0;
    const totalPages = Math.max(1, Math.ceil(totalRecords / limit));

    res.json({
      success: true,
      data: {
        records: result.records || [],
        metrics: result.metrics || {
          totalVoicemailsSent: 0,
          successfulDeliveries: 0,
          deliveryRate: 0,
          failedDeliveries: 0,
          failureRate: 0,
          otherStatus: 0,
          otherStatusRate: 0,
          totalCampaignCost: 0,
        },
        pagination: {
          currentPage: page,
          pageSize: limit,
          totalRecords: totalRecords,
          totalPages: totalPages,
          hasMore: page < totalPages,
        },
      },
    });
  } catch (error) {
    logger.error("Error fetching DropCowboy records", { error: error.message });
    res.status(500).json({
      success: false,
      message: "Failed to fetch records",
      error: error.message,
    });
  }
});

// Get campaign details
router.get("/campaigns/:campaignName", async (req, res) => {
  try {
    const { campaignName } = req.params;
    const metrics = await dataService.getMetrics({ campaignName });

    const campaign = metrics.campaigns.find(
      (c) => c.campaignName === campaignName
    );

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: "Campaign not found",
      });
    }

    res.json({
      success: true,
      data: campaigns,
    });
  } catch (error) {
    logger.error("Error fetching DropCowboy campaigns list", {
      error: error.message,
    });
    res.status(500).json({
      success: false,
      message: "Failed to fetch campaign details",
      error: error.message,
    });
  }
});

// Get all campaigns (for client linking)
router.get("/campaigns", async (req, res) => {
  try {
    const campaigns = await dataService.getAllCampaigns();

    res.json({
      success: true,
      campaigns,
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

// Get client IDs that have VM campaigns mapped (for service detection)
router.get("/clients-with-campaigns", async (req, res) => {
  try {
    const clientIds = await dataService.getClientIdsWithCampaigns();
    
    res.json({
      success: true,
      clientIds,
    });
  } catch (error) {
    logger.error("Error fetching clients with VM campaigns:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch clients with VM campaigns",
      error: error.message,
    });
  }
});

// Link campaign to client
router.post("/campaigns/:campaignId/link-client", async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { clientId } = req.body;

    if (!clientId) {
      return res.status(400).json({
        success: false,
        message: "clientId is required",
      });
    }

    const result = await dataService.linkCampaignToClient(campaignId, clientId);

    res.json({
      success: true,
      message: "Campaign linked to client successfully",
      data: result,
    });
  } catch (error) {
    logger.error("Error linking campaign to client:", error);
    res.status(500).json({
      success: false,
      message: "Failed to link campaign to client",
      error: error.message,
    });
  }
});

// Unlink campaign from client
router.post("/campaigns/:campaignId/unlink-client", async (req, res) => {
  try {
    const { campaignId } = req.params;

    const result = await dataService.unlinkCampaignFromClient(campaignId);

    res.json({
      success: true,
      message: "Campaign unlinked from client successfully",
      data: result,
    });
  } catch (error) {
    logger.error("Error unlinking campaign from client:", error);
    res.status(500).json({
      success: false,
      message: "Failed to unlink campaign from client",
      error: error.message,
    });
  }
});

// Clear all DropCowboy data and re-sync from SFTP
router.post("/clear-and-resync", async (req, res) => {
  try {
    logger.info("Manual clear and re-sync triggered", {
      user: req.user?.email || "system",
    });

    // Check if sync is already in progress
    if (isSyncInProgress) {
      return res.status(409).json({
        success: false,
        message: "A sync operation is already in progress",
        syncStartTime: currentSyncStartTime,
      });
    }

    // Mark sync as in progress
    isSyncInProgress = true;
    currentSyncStartTime = new Date();

    // Start the clear and re-sync process
    res.json({
      success: true,
      message: "DropCowboy data clear and re-sync started",
      startTime: currentSyncStartTime,
    });

    // Run the actual sync in background
    (async () => {
      try {
        // Clear all existing data
        const clearResult = await dataService.clearAllDropCowboyData();
        logger.info("DropCowboy data cleared for re-sync", clearResult);

        // Download files from SFTP
        const downloadResult = await sftpService.downloadAllFiles();

        if (!downloadResult.success) {
          throw new Error("Failed to download files from SFTP");
        }

        // Parse downloaded files
        const campaignData = await sftpService.parseLocalFiles();

        // Save and aggregate data (with client matching/creation logic)
        const metrics = await dataService.saveCampaignData(campaignData);

        // Log the successful sync
        await dataService.logSync("success", {
          type: "manual_clear_resync",
          filesDownloaded: downloadResult.filesDownloaded,
          campaignsProcessed: campaignData.length,
          totalRecords: campaignData.reduce((sum, c) => sum + c.recordCount, 0),
        });

        logger.info("DropCowboy clear and re-sync completed successfully", {
          filesDownloaded: downloadResult.filesDownloaded,
          campaignsProcessed: campaignData.length,
        });
      } catch (error) {
        logger.error("DropCowboy clear and re-sync failed", {
          error: error.message,
          stack: error.stack,
        });

        await dataService.logSync("failed", {
          type: "manual_clear_resync",
          error: error.message,
        });
      } finally {
        // Reset sync flag
        isSyncInProgress = false;
        currentSyncStartTime = null;
      }
    })();
  } catch (error) {
    isSyncInProgress = false;
    currentSyncStartTime = null;

    logger.error("Error starting clear and re-sync", { error: error.message });
    res.status(500).json({
      success: false,
      message: "Failed to start clear and re-sync",
      error: error.message,
    });
  }
});

// Rebuild campaigns from existing records (repairs missing campaign entries)
router.post("/rebuild-campaigns", async (req, res) => {
  try {
    logger.info("Rebuilding campaigns from existing records...");
    
    const result = await dataService.rebuildCampaignsFromRecords();
    
    res.json({
      success: true,
      message: `Rebuilt ${result.campaignsCreated} campaigns, linked ${result.campaignsLinked} to clients`,
      data: result,
    });
  } catch (error) {
    logger.error("Error rebuilding campaigns:", error);
    res.status(500).json({
      success: false,
      message: "Failed to rebuild campaigns",
      error: error.message,
    });
  }
});

// Health check
router.get("/health", (req, res) => {
  res.json({
    success: true,
    message: "Ringless Voicemail API is healthy",
    timestamp: new Date().toISOString(),
  });
});

export default router;
