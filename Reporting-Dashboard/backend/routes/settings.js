import express from "express";
import prisma from "../prisma/client.js";
import { authenticate, requirePermission, requireFullAccess } from "../middleware/auth.js";
import logger from "../utils/logger.js";

const router = express.Router();

/**
 * GET /api/settings
 * Get global settings (requires authentication)
 */
router.get("/", authenticate, async (req, res) => {
  try {
    let settings = await prisma.settings.findFirst();

    // Create default settings if none exist
    if (!settings) {
      settings = await prisma.settings.create({
        data: {
          notifEmailNotifications: true,
          notifTaskDeadlineReminder: true,
          notifOverdueTasks: true,
          notifProjectStatusUpdates: true,
          notifWeeklyReports: true,
          notifWeeklyReportDay: "friday",
          notifWeeklyReportTime: "09:00",
          notifActivityEmails: true,
        },
      });
    }

    res.json({
      success: true,
      settings,
    });
  } catch (error) {
    logger.error("Error fetching settings", {
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({
      success: false,
      message: "Failed to fetch settings",
      error: error.message,
    });
  }
});

/**
 * GET /api/settings/admin-permissions
 * Get all users with Settings permissions (full access users only)
 * Returns users who have Settings permissions in their customRole
 */
router.get(
  "/admin-permissions",
  authenticate,
  requireFullAccess,
  async (req, res) => {
    try {
      // Find users with Settings permissions in their customRole
      const usersWithSettings = await prisma.user.findMany({
        where: { 
          isActive: true,
          customRole: {
            isActive: true,
            OR: [
              { fullAccess: true },
              { permissions: { path: ['Settings'], not: {} } }
            ]
          }
        },
        select: {
          id: true,
          name: true,
          email: true,
          customRole: {
            select: {
              name: true,
              fullAccess: true,
              permissions: true
            }
          },
          adminSettingsPermissions: {
            select: {
              setting: true,
            },
          },
        },
        orderBy: { name: "asc" },
      });

      const adminsWithPermissions = usersWithSettings.map((user) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        customRole: user.customRole?.name,
        permissions: user.customRole?.fullAccess 
          ? ["mautic", "smtp", "sftp", "vicidial", "sitecustom", "notifs", "maintenance"]
          : user.adminSettingsPermissions.map((p) => p.setting),
      }));

      res.json({
        success: true,
        admins: adminsWithPermissions,
      });
    } catch (error) {
      logger.error("Error fetching Roles", {
        error: error.message,
        stack: error.stack,
      });
      res.status(500).json({
        success: false,
        message: "Failed to fetch Roles",
        error: error.message,
      });
    }
  }
);

/**
 * PUT /api/settings/admin-permissions/:adminId
 * Update settings permissions for a specific user (full access users only)
 * Body: { permissions: ['mautic', 'smtp', ...] }
 */
router.put(
  "/admin-permissions/:adminId",
  authenticate,
  requireFullAccess,
  async (req, res) => {
    try {
      const { adminId } = req.params;
      const { permissions } = req.body;

      // Validate user exists and has Settings permissions
      const user = await prisma.user.findUnique({
        where: { id: parseInt(adminId) },
        include: {
          customRole: {
            select: { fullAccess: true, permissions: true }
          }
        }
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      // Check if user has Settings access via customRole
      const hasSettingsAccess = user.customRole?.fullAccess || 
        (user.customRole?.permissions?.Settings && user.customRole.permissions.Settings.length > 0);

      if (!hasSettingsAccess) {
        return res.status(400).json({
          success: false,
          message: "User does not have Settings permissions in their role",
        });
      }

      // Valid settings
      const validSettings = [
        "mautic",
        "smtp",
        "sftp",
        "vicidial",
        "sitecustom",
        "notifs",
        "maintenance",
      ];
      const invalidSettings = permissions.filter(
        (p) => !validSettings.includes(p)
      );

      if (invalidSettings.length > 0) {
        return res.status(400).json({
          success: false,
          message: `Invalid settings: ${invalidSettings.join(", ")}`,
        });
      }

      // Delete existing permissions and create new ones
      await prisma.$transaction([
        prisma.adminSettingsPermission.deleteMany({
          where: { adminId: parseInt(adminId) },
        }),
        ...(permissions.length > 0
          ? [
              prisma.adminSettingsPermission.createMany({
                data: permissions.map((setting) => ({
                  adminId: parseInt(adminId),
                  setting,
                })),
              }),
            ]
          : []),
      ]);

      logger.info("Admin settings permissions updated", {
        userId: req.user.id,
        adminId,
        permissions,
      });

      res.json({
        success: true,
        message: "Roles updated successfully",
      });
    } catch (error) {
      logger.error("Error updating Roles", {
        error: error.message,
        stack: error.stack,
        userId: req.user?.id,
      });
      res.status(500).json({
        success: false,
        message: "Failed to update Roles",
        error: error.message,
      });
    }
  }
);

/**
 * GET /api/settings/my-permissions
 * Get current admin's settings permissions
 */
router.get("/my-permissions", authenticate, async (req, res) => {
  try {
    const { hasFullAccess } = await import("../middleware/auth.js");
    
    // Users with full access have access to all settings
    if (hasFullAccess(req.user)) {
      return res.json({
        success: true,
        permissions: [
          "mautic",
          "smtp",
          "sftp",
          "vicidial",
          "sitecustom",
          "notifs",
          "maintenance",
        ],
      });
    }

    // For users with Settings permissions, check their customRole
    if (req.user.customRole?.permissions?.Settings) {
      const settingsPerms = req.user.customRole.permissions.Settings;
      // Map Settings permissions to specific setting areas
      // Users with Settings.Read get read-only access, Settings.Update gets full access
      if (settingsPerms.includes('Update') || settingsPerms.includes('Read')) {
        // Return configured permissions or all if they have full Settings access
        const permissions = await prisma.adminSettingsPermission.findMany({
          where: { adminId: req.user.id },
          select: { setting: true },
        });

        return res.json({
          success: true,
          permissions: permissions.length > 0 
            ? permissions.map((p) => p.setting)
            : ["mautic", "smtp", "sftp", "vicidial", "sitecustom", "notifs", "maintenance"],
        });
      }
    }

    // Other users have no settings access
    res.json({
      success: true,
      permissions: [],
    });
  } catch (error) {
    logger.error("Error fetching user permissions", {
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({
      success: false,
      message: "Failed to fetch permissions",
      error: error.message,
    });
  }
});

/**
 * PUT /api/settings
 * Update global settings (superadmin only)
 */
router.put(
  "/",
  authenticate,
  requirePermission("Settings", "Update"),
  async (req, res) => {
    try {
      const {
        notifEmailNotifications,
        notifTaskDeadlineReminder,
        notifOverdueTasks,
        notifProjectStatusUpdates,
        notifWeeklyReports,
        notifWeeklyReportDay,
        notifWeeklyReportTime,
        notifActivityEmails,
      } = req.body;

      // Get or create settings
      let settings = await prisma.settings.findFirst();

      const data = {
        ...(notifEmailNotifications !== undefined && {
          notifEmailNotifications,
        }),
        ...(notifTaskDeadlineReminder !== undefined && {
          notifTaskDeadlineReminder,
        }),
        ...(notifOverdueTasks !== undefined && { notifOverdueTasks }),
        ...(notifProjectStatusUpdates !== undefined && {
          notifProjectStatusUpdates,
        }),
        ...(notifWeeklyReports !== undefined && { notifWeeklyReports }),
        ...(notifWeeklyReportDay !== undefined && { notifWeeklyReportDay }),
        ...(notifWeeklyReportTime !== undefined && { notifWeeklyReportTime }),
        ...(notifActivityEmails !== undefined && { notifActivityEmails }),
      };

      if (settings) {
        settings = await prisma.settings.update({
          where: { id: settings.id },
          data,
        });
      } else {
        settings = await prisma.settings.create({ data });
      }

      logger.info("Settings updated", {
        userId: req.user.id,
        changes: Object.keys(data),
      });

      res.json({
        success: true,
        message: "Settings updated successfully",
        settings,
      });
    } catch (error) {
      logger.error("Error updating settings", {
        error: error.message,
        stack: error.stack,
        userId: req.user?.id,
      });
      res.status(500).json({
        success: false,
        message: "Failed to update settings",
        error: error.message,
      });
    }
  }
);

export default router;
