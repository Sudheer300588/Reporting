import express from "express";
import prisma from "../prisma/client.js";
import {
  authenticate,
  requirePermission,
  canManageClients,
  canViewClients,
  hasFullAccess,
  userHasPermission,
} from "../middleware/auth.js";
import {
  validate,
  validateParams,
  createClientSchema,
  updateClientSchema,
  assignClientSchema,
  clientIdSchema,
} from "../validators/schemas.js";
import logger from "../utils/logger.js";
import { logActivity } from "../middleware/activityLogger.js";
import {
  notifyClientAssigned,
  notifyClientUnassigned,
} from "../utils/emailHelper.js";
import DropCowboyScheduler from "../modules/dropCowboy/services/schedulerService.js";
import DataService from "../modules/dropCowboy/services/dataService.js";

const router = express.Router();

// ============================================
// GET ALL CLIENTS (Role-based filtering)
// Supports pagination via ?page=1&limit=50
// ============================================
router.get("/", authenticate, canViewClients, async (req, res) => {
  try {
    const { id: userId } = req.user;
    const { page, limit } = req.query;

    // Pagination parameters
    const pageNum = parseInt(page) || undefined;
    const limitNum = parseInt(limit) || undefined;
    const skip = pageNum && limitNum ? (pageNum - 1) * limitNum : undefined;
    const take = limitNum || undefined;

    let whereClause = {};
    let clients, total;

    // Permission-based filtering
    if (hasFullAccess(req.user)) {
      // Full access users can see all clients
      whereClause = {};
    } else if (userHasPermission(req.user, 'Clients', 'Read') || userHasPermission(req.user, 'Clients', 'Create')) {
      // Users with Clients.Read or Clients.Create can see clients they created or are assigned to
      whereClause = {
        OR: [
          { createdById: userId },
          { assignments: { some: { userId: userId } } },
        ],
      };
    } else {
      // Limited users can only see clients they're assigned to
      whereClause = {
        assignments: {
          some: { userId: userId },
        },
      };
    }

    // Execute query with pagination support
    [clients, total] = await Promise.all([
      prisma.client.findMany({
        where: whereClause,
        include: {
          createdBy: {
            select: { id: true, name: true, email: true, role: true },
          },
          assignments: {
            include: {
              user: {
                select: { id: true, name: true, email: true, role: true },
              },
              assignedBy: {
                select: { id: true, name: true, email: true },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      pageNum && limitNum
        ? prisma.client.count({ where: whereClause })
        : Promise.resolve(undefined),
    ]);

    // If pagination requested, return paginated response
    if (pageNum && limitNum) {
      res.json({
        success: true,
        data: clients,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      });
    } else {
      // Legacy response format for backward compatibility
      res.json(clients);
    }
  } catch (error) {
    logger.error("Error fetching clients", {
      error: error.message,
      userId: req.user.id,
    });
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ============================================
// GET SINGLE CLIENT BY ID
// ============================================
router.get("/:id", authenticate, canViewClients, async (req, res) => {
  try {
    const clientId = parseInt(req.params.id);
    const { id: userId } = req.user;

    const client = await prisma.client.findUnique({
      where: { id: clientId },
      include: {
        createdBy: {
          select: { id: true, name: true, email: true, role: true },
        },
        assignments: {
          include: {
            user: {
              select: { id: true, name: true, email: true, role: true },
            },
            assignedBy: {
              select: { id: true, name: true, email: true },
            },
          },
        },
      },
    });

    if (!client) {
      return res.status(404).json({ message: "Client not found" });
    }

    // Permission-based access check
    if (hasFullAccess(req.user)) {
      // Full access users can view any client
      return res.json(client);
    } else if (userHasPermission(req.user, 'Clients', 'Read') || userHasPermission(req.user, 'Clients', 'Create')) {
      // Users with Clients permissions can view if they created or are assigned
      if (
        client.createdById === userId ||
        client.assignments.some((a) => a.userId === userId)
      ) {
        return res.json(client);
      }
    } else {
      // Limited users can only view if assigned
      if (client.assignments.some((a) => a.userId === userId)) {
        return res.json(client);
      }
    }

    return res.status(403).json({
      message: "Access denied. You do not have permission to view this client.",
    });
  } catch (error) {
    logger.error("Error fetching client", {
      error: error.message,
      stack: error.stack,
      clientId: req.params.id,
    });
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ============================================
// CREATE NEW CLIENT (SuperAdmin only)
// ============================================
router.post(
  "/",
  authenticate,
  requirePermission("Clients", "Create"),
  validate(createClientSchema),
  async (req, res) => {
    try {
      const { name, type, contactEmail, contactPhone, assignedUsers } =
        req.body;
      const { id: createdById } = req.user;

      const client = await prisma.client.create({
        data: {
          name,
          clientType: type, // Map 'type' from request to 'clientType' in DB
          email: contactEmail,
          phone: contactPhone,
          createdById,
        },
        include: {
          createdBy: {
            select: { id: true, name: true, email: true, role: true },
          },
        },
      });

      // If assignedUsers are provided, create assignments
      if (assignedUsers && assignedUsers.length > 0) {
        try {
          await prisma.clientAssignment.createMany({
            data: assignedUsers.map((userId) => ({
              clientId: client.id,
              userId: userId,
              assignedById: createdById,
            })),
          });
        } catch (assignError) {
          logger.error("Error creating assignments", {
            error: assignError.message,
            clientId: client.id,
          });
          // Don't fail the client creation if assignment fails
        }
      }

      // Log activity
      await logActivity(
        req.user,
        "client_created",
        "client",
        client.id,
        `Created client: ${client.name} (Type: ${type})`,
        { clientId: client.id, clientName: client.name, clientType: type },
        req
      );

      // If client type is Mautic, clear all DropCowboy data and trigger re-sync
      if (type === "mautic") {
        logger.info(
          "Mautic client created - triggering DropCowboy data refresh",
          {
            clientId: client.id,
            clientName: client.name,
          }
        );

        // Clear and re-sync in background (don't block response)
        (async () => {
          try {
            const dataService = new DataService();
            const scheduler = new DropCowboyScheduler();

            // Clear all existing DropCowboy data
            const clearResult = await dataService.clearAllDropCowboyData();
            logger.info("DropCowboy data cleared successfully", clearResult);

            // Trigger SFTP sync to re-fetch and merge data
            const syncResult = await scheduler.fetchAndProcessData();
            logger.info("DropCowboy SFTP sync completed", syncResult);
          } catch (syncError) {
            logger.error(
              "Failed to refresh DropCowboy data after Mautic client creation",
              {
                error: syncError.message,
                stack: syncError.stack,
                clientId: client.id,
              }
            );
          }
        })();
      }

      res.status(201).json(client);
    } catch (error) {
      logger.error("Error creating client", {
        error: error.message,
        stack: error.stack,
      });
      res.status(500).json({ message: "Server error", error: error.message });
    }
  }
);

// ============================================
// UPDATE CLIENT (SuperAdmin and Admin)
// ============================================
router.put("/:id", authenticate, requirePermission("Clients", "Update"), async (req, res) => {
  try {
    const clientId = parseInt(req.params.id);
    const {
      name,
      email,
      phone,
      company,
      address,
      website,
      description,
      isActive,
    } = req.body;

    const existingClient = await prisma.client.findUnique({
      where: { id: clientId },
    });

    if (!existingClient) {
      return res.status(404).json({ message: "Client not found" });
    }

    const client = await prisma.client.update({
      where: { id: clientId },
      data: {
        name,
        email,
        phone,
        company,
        address,
        website,
        description,
        isActive,
      },
      include: {
        createdBy: {
          select: { id: true, name: true, email: true, role: true },
        },
        assignments: {
          include: {
            user: {
              select: { id: true, name: true, email: true, role: true },
            },
          },
        },
      },
    });

    // Log activity
    await logActivity(
      req.user,
      "client_updated",
      "client",
      client.id,
      `Updated client: ${client.name}`,
      { clientId: client.id, clientName: client.name },
      req
    );

    res.json(client);
  } catch (error) {
    logger.error("Error updating client", {
      error: error.message,
      stack: error.stack,
      clientId: req.params.id,
    });
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ============================================
// DELETE CLIENT (SuperAdmin and Admin)
// ============================================
router.delete(
  "/:id",
  authenticate,
  requirePermission("Clients", "Delete"),
  async (req, res) => {
    try {
      const clientId = parseInt(req.params.id);

      const client = await prisma.client.findUnique({
        where: { id: clientId },
        include: { assignments: true },
      });

      if (!client) {
        return res.status(404).json({ message: "Client not found" });
      }

      // Soft-deactivate instead of hard delete
      await prisma.client.update({
        where: { id: clientId },
        data: { isActive: false },
      });

      // Log activity
      await logActivity(
        req.user,
        "client_deactivated",
        "client",
        clientId,
        `Deactivated client: ${client.name}`,
        { clientId: client.id, clientName: client.name },
        req
      );

      res.json({ message: "Client deactivated successfully" });
    } catch (error) {
      logger.error("Error deleting client", {
        error: error.message,
        stack: error.stack,
        clientId: req.params.id,
      });
      res.status(500).json({ message: "Server error", error: error.message });
    }
  }
);

// ============================================
// GET MANAGERS FOR ASSIGNMENT DROPDOWN
// ============================================
router.get(
  "/assignment/managers",
  authenticate,
  canManageClients,
  async (req, res) => {
    try {
      const { role: userRole, id: userId } = req.user;

      let managers;

      if (userRole === "superadmin" || userRole === "admin") {
        // SuperAdmin and Admin see all active managers
        managers = await prisma.user.findMany({
          where: {
            role: "manager",
            isActive: true,
          },
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
          orderBy: { name: "asc" },
        });
      } else if (userRole === "manager") {
        // Manager only sees themselves
        managers = await prisma.user.findMany({
          where: {
            id: userId,
            role: "manager",
            isActive: true,
          },
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        });
      } else {
        return res.status(403).json({ message: "Access denied" });
      }

      res.json({ managers });
    } catch (error) {
      logger.error("Error fetching managers", {
        error: error.message,
        stack: error.stack,
      });
      res.status(500).json({ message: "Server error", error: error.message });
    }
  }
);

// ============================================
// GET EMPLOYEES UNDER A SPECIFIC MANAGER
// ============================================
router.get(
  "/assignment/managers/:managerId/employees",
  authenticate,
  canManageClients,
  async (req, res) => {
    try {
      const managerId = parseInt(req.params.managerId);
      const { role: userRole, id: userId } = req.user;

      // Verify the manager exists
      const manager = await prisma.user.findUnique({
        where: { id: managerId },
      });

      if (!manager || manager.role !== "manager") {
        return res.status(404).json({ message: "Manager not found" });
      }

      // SuperAdmin can see employees under any manager
      // Manager can only see employees under themselves
      if (userRole === "manager" && managerId !== userId) {
        return res
          .status(403)
          .json({ message: "You can only view employees under yourself" });
      }

      // Get employees and telecallers created by or assigned to this manager
      const employees = await prisma.user.findMany({
        where: {
          OR: [
            {
              // Users created by this manager
              createdById: managerId,
              role: { in: ["employee", "telecaller"] },
              isActive: true,
            },
            {
              // Users who have this manager assigned
              managers: { some: { id: managerId } },
              role: { in: ["employee", "telecaller"] },
              isActive: true,
            },
          ],
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          createdAt: true,
        },
        orderBy: { name: "asc" },
      });

      res.json({ employees, manager: { id: manager.id, name: manager.name } });
    } catch (error) {
      logger.error("Error fetching employees", {
        error: error.message,
        stack: error.stack,
        managerId: req.params.managerId,
      });
      res.status(500).json({ message: "Server error", error: error.message });
    }
  }
);

// ============================================
// ASSIGN CLIENT TO USER (SuperAdmin and Manager)
// ============================================
router.post("/:id/assign", authenticate, canManageClients, async (req, res) => {
  try {
    const clientId = parseInt(req.params.id);
    const { userId } = req.body;
    const { id: assignedById, role: assignerRole } = req.user;

    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    const client = await prisma.client.findUnique({
      where: { id: clientId },
    });

    if (!client) {
      return res.status(404).json({ message: "Client not found" });
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!targetUser) {
      return res.status(404).json({ message: "User not found" });
    }

    // SuperAdmin and Admin can assign to anyone (Manager, Employee, Telecaller)
    if (assignerRole === "superadmin" || assignerRole === "admin") {
      if (!["manager", "employee", "telecaller"].includes(targetUser.role)) {
        return res.status(400).json({
          message:
            "SuperAdmin/Admin can only assign clients to Managers, Employees, or Telecallers",
        });
      }
    }
    // Manager can only assign to Employee or Telecaller
    else if (assignerRole === "manager") {
      if (!["employee", "telecaller"].includes(targetUser.role)) {
        return res.status(400).json({
          message:
            "Managers can only assign clients to Employees or Telecallers",
        });
      }
      // Manager can only assign clients they have access to
      const hasAccess =
        client.createdById === assignedById ||
        (await prisma.clientAssignment.findFirst({
          where: { clientId, userId: assignedById },
        }));
      if (!hasAccess) {
        return res.status(403).json({
          message: "You can only assign clients that are assigned to you",
        });
      }
    }

    // Check if assignment already exists
    const existingAssignment = await prisma.clientAssignment.findUnique({
      where: {
        clientId_userId: { clientId, userId },
      },
    });

    if (existingAssignment) {
      return res
        .status(400)
        .json({ message: "Client is already assigned to this user" });
    }

    const assignment = await prisma.clientAssignment.create({
      data: {
        clientId,
        userId,
        assignedById,
      },
      include: {
        client: true,
        user: {
          select: { id: true, name: true, email: true, role: true },
        },
        assignedBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    // Log activity
    await logActivity(
      req.user,
      "client_assigned",
      "client",
      clientId,
      `Assigned client ${client.name} to ${targetUser.name}`,
      {
        clientId: client.id,
        clientName: client.name,
        assignedToId: targetUser.id,
        assignedToName: targetUser.name,
      },
      req
    );

    // Send email notification
    notifyClientAssigned(client, targetUser, req.user).catch((err) =>
      logger.error("Failed to send client assignment email", {
        error: err.message,
        clientId: client.id,
      })
    );

    res.status(201).json({
      success: true,
      message: `Client successfully assigned to ${targetUser.name}`,
      data: assignment,
    });
  } catch (error) {
    logger.error("Error assigning client", {
      error: error.message,
      stack: error.stack,
      clientId: req.params.id,
      userId: req.body?.userId,
    });
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ============================================
// UNASSIGN CLIENT FROM USER (SuperAdmin and Manager)
// ============================================
router.delete(
  "/:id/assign/:userId",
  authenticate,
  canManageClients,
  async (req, res) => {
    try {
      const clientId = parseInt(req.params.id);
      const userId = parseInt(req.params.userId);
      const { id: requesterId, role: requesterRole } = req.user;

      const assignment = await prisma.clientAssignment.findUnique({
        where: {
          clientId_userId: { clientId, userId },
        },
        include: {
          client: true,
          user: {
            select: { id: true, name: true, email: true, role: true },
          },
        },
      });

      if (!assignment) {
        return res.status(404).json({ message: "Assignment not found" });
      }

      // Manager can only unassign from clients they have access to
      if (requesterRole === "manager") {
        // Managers cannot unassign themselves
        if (requesterId === userId) {
          return res
            .status(403)
            .json({ message: "You cannot unassign yourself from a client" });
        }
        const hasAccess =
          assignment.client.createdById === requesterId ||
          (await prisma.clientAssignment.findFirst({
            where: { clientId, userId: requesterId },
          }));
        if (!hasAccess) {
          return res.status(403).json({
            message: "You can only unassign clients that are assigned to you",
          });
        }
      }

      await prisma.clientAssignment.delete({
        where: {
          clientId_userId: { clientId, userId },
        },
      });

      // Log activity
      await logActivity(
        req.user,
        "client_unassigned",
        "client",
        clientId,
        `Unassigned client ${assignment.client.name} from ${assignment.user.name}`,
        {
          clientId: assignment.client.id,
          clientName: assignment.client.name,
          unassignedFromId: assignment.user.id,
          unassignedFromName: assignment.user.name,
        },
        req
      );

      // Send email notification
      notifyClientUnassigned(
        assignment.client,
        assignment.user,
        req.user
      ).catch((err) =>
        logger.error("Failed to send client unassignment email", {
          error: err.message,
          clientId: assignment.client.id,
        })
      );

      res.json({
        success: true,
        message: `Client successfully unassigned from ${assignment.user.name}`,
      });
    } catch (error) {
      logger.error("Error unassigning client", {
        error: error.message,
        stack: error.stack,
        clientId: req.params.id,
        userId: req.params.userId,
      });
      res.status(500).json({ message: "Server error", error: error.message });
    }
  }
);

// ============================================
// GET CLIENT DASHBOARD DATA (All roles - based on assignment)
// ============================================
router.get("/:id/dashboard", authenticate, canViewClients, async (req, res) => {
  try {
    const clientId = parseInt(req.params.id);
    const { id: userId } = req.user;

    const client = await prisma.client.findUnique({
      where: { id: clientId },
      include: {
        assignments: {
          include: {
            user: {
              select: { id: true, name: true, email: true, role: true },
            },
          },
        },
      },
    });

    if (!client) {
      return res.status(404).json({ message: "Client not found" });
    }

    // Permission-based access check for dashboard
    let hasAccessPermission = false;
    if (hasFullAccess(req.user)) {
      hasAccessPermission = true;
    } else if (userHasPermission(req.user, 'Clients', 'Read') || userHasPermission(req.user, 'Clients', 'Create')) {
      hasAccessPermission =
        client.createdById === userId ||
        client.assignments.some((a) => a.userId === userId);
    } else {
      hasAccessPermission = client.assignments.some((a) => a.userId === userId);
    }

    if (!hasAccessPermission) {
      return res.status(403).json({
        message:
          "Access denied. You do not have permission to view this client's dashboard.",
      });
    }

    // Prepare base dashboard data
    const dashboardData = {
      client: {
        id: client.id,
        name: client.name,
        email: client.email,
        phone: client.phone,
        company: client.company,
        website: client.website,
        mauticClientId: client.mauticClientId,
        dropCowboyCampaigns: client.dropCowboyCampaigns,
      },
      assignedUsers: client.assignments.map((a) => ({
        id: a.user.id,
        name: a.user.name,
        email: a.user.email,
        role: a.user.role,
        assignedAt: a.createdAt,
      })),
      metrics: {
        totalAssignments: client.assignments.length,
      },
    };

    // Fetch Mautic data if client has Mautic integration
    if (client.mauticClientId) {
      try {
        // Get Mautic client info for contact stats
        const mauticClient = await prisma.mauticClient.findUnique({
          where: { id: client.mauticClientId },
          select: {
            totalContacts: true,
            activeContacts30d: true,
            totalEmails: true,
            totalCampaigns: true,
            totalSegments: true,
          },
        });

        const [emails, campaigns, segments] = await Promise.all([
          prisma.mauticEmail.findMany({
            where: { clientId: client.mauticClientId },
            orderBy: { createdAt: "desc" },
            take: 50,
          }),
          prisma.mauticCampaign.findMany({
            where: { clientId: client.mauticClientId },
          }),
          prisma.mauticSegment.findMany({
            where: { clientId: client.mauticClientId },
          }),
        ]);

        dashboardData.mauticData = {
          contacts: {
            total: mauticClient?.totalContacts || 0,
            active: mauticClient?.activeContacts30d || 0,
          },
          emails: {
            total: emails.length,
            recent: emails.slice(0, 10),
            stats: {
              sent: emails.reduce((sum, e) => sum + e.sentCount, 0),
              read: emails.reduce((sum, e) => sum + e.readCount, 0),
              clicked: emails.reduce((sum, e) => sum + e.clickedCount, 0),
            },
          },
          campaigns: {
            total: campaigns.length,
            list: campaigns.map((c) => ({
              id: c.id,
              name: c.name,
              isPublished: c.isPublished,
              dateAdded: c.dateAdded,
            })),
          },
          segments: {
            total: segments.length,
            list: segments.map((s) => ({
              id: s.id,
              name: s.name,
              isPublished: s.isPublished,
              dateAdded: s.dateAdded,
            })),
          },
          dashboardUrl: client.website, // Link to external Autovation  Dashboard
        };
      } catch (mauticError) {
        logger.error("Error fetching Mautic data", {
          error: mauticError.message,
          clientId: client.id,
        });
        dashboardData.mauticData = { error: "Failed to fetch Mautic data" };
      }
    }

    // Fetch Ringless Voicemail data if client has Ringless Voicemail campaigns
    if (client.dropCowboyCampaigns) {
      try {
        const campaignIds = JSON.parse(client.dropCowboyCampaigns);

        const [campaigns, records] = await Promise.all([
          prisma.campaign.findMany({
            where: { campaignId: { in: campaignIds } },
          }),
          prisma.campaignRecord.findMany({
            where: { campaignId: { in: campaignIds } },
            orderBy: { date: "desc" },
            take: 1000, // Get recent records for analysis
          }),
        ]);

        // Calculate aggregated metrics from actual schema fields
        const totalRecords = records.length;
        const successfulCalls = records.filter((r) =>
          ["sent", "success", "delivered"].includes(
            r.status?.toLowerCase() || ""
          )
        ).length;
        const callbackCount = records.reduce(
          (sum, r) => sum + (r.callbacks || 0),
          0
        );
        const totalCost = records.reduce(
          (sum, r) => sum + (parseFloat(r.cost) || 0),
          0
        );
        const totalComplianceFee = records.reduce(
          (sum, r) => sum + (parseFloat(r.complianceFee) || 0),
          0
        );
        const totalTtsFee = records.reduce(
          (sum, r) => sum + (parseFloat(r.ttsFee) || 0),
          0
        );
        const totalSms = records.reduce((sum, r) => sum + (r.smsCount || 0), 0);

        // Group by campaign with actual fields
        const byCampaign = campaigns.map((campaign) => {
          const campaignRecords = records.filter(
            (r) => r.campaignId === campaign.campaignId
          );
          const successful = campaignRecords.filter((r) =>
            ["sent", "success", "delivered"].includes(
              r.status?.toLowerCase() || ""
            )
          ).length;
          return {
            id: campaign.campaignId,
            name: campaign.campaignName,
            recordCount: campaignRecords.length,
            successfulDeliveries: successful,
            callbacks: campaignRecords.reduce(
              (sum, r) => sum + (r.callbacks || 0),
              0
            ),
            smsCount: campaignRecords.reduce(
              (sum, r) => sum + (r.smsCount || 0),
              0
            ),
            cost: campaignRecords.reduce(
              (sum, r) => sum + (parseFloat(r.cost) || 0),
              0
            ),
            complianceFee: campaignRecords.reduce(
              (sum, r) => sum + (parseFloat(r.complianceFee) || 0),
              0
            ),
          };
        });

        // Get date range
        const dates = records.filter((r) => r.date).map((r) => r.date);
        const minDate = dates.length > 0 ? dates[0] : null;
        const maxDate = dates.length > 0 ? dates[dates.length - 1] : null;

        dashboardData.dropCowboyData = {
          campaigns: byCampaign,
          summary: {
            totalCampaigns: campaigns.length,
            totalRecords,
            totalCalls: totalRecords,
            successfulDeliveries: successfulCalls,
            totalCallbacks: callbackCount,
            totalSms,
            totalCost: totalCost.toFixed(2),
            totalFees: (totalComplianceFee + totalTtsFee).toFixed(2),
            successRate:
              totalRecords > 0
                ? ((successfulCalls / totalRecords) * 100).toFixed(2)
                : 0,
            callbackRate:
              totalRecords > 0
                ? ((callbackCount / totalRecords) * 100).toFixed(2)
                : 0,
          },
          dateRange: {
            from: minDate,
            to: maxDate,
          },
          recentRecords: records.slice(0, 20).map((r) => ({
            campaignId: r.campaignId,
            campaignName: r.campaignName,
            phoneNumber: r.phoneNumber,
            date: r.date,
            status: r.status,
            callbacks: r.callbacks,
            smsCount: r.smsCount,
            cost: parseFloat(r.cost || 0).toFixed(2),
            carrier: r.carrier,
            lineType: r.lineType,
          })),
        };
      } catch (dropCowboyError) {
        logger.error("Error fetching Ringless Voicemail data", {
          error: dropCowboyError.message,
          clientId: client.id,
        });
        dashboardData.dropCowboyData = {
          error: "Failed to fetch Ringless Voicemail data",
        };
      }
    }

    res.json(dashboardData);
  } catch (error) {
    logger.error("Error fetching client dashboard", {
      error: error.message,
      stack: error.stack,
      clientId: req.params.id,
    });
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

export default router;
