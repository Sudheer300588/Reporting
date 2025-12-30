import express from "express";
import prisma from "../prisma/client.js";
import { authenticate, authorize } from "../middleware/auth.js";
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
 * Get all admins with their settings permissions (superadmin only)
 */
router.get(
  "/admin-permissions",
  authenticate,
  authorize("superadmin"),
  async (req, res) => {
    try {
      const admins = await prisma.user.findMany({
        where: { role: "admin", isActive: true },
        select: {
          id: true,
          name: true,
          email: true,
          adminSettingsPermissions: {
            select: {
              setting: true,
            },
          },
        },
        orderBy: { name: "asc" },
      });

      const adminsWithPermissions = admins.map((admin) => ({
        id: admin.id,
        name: admin.name,
        email: admin.email,
        permissions: admin.adminSettingsPermissions.map((p) => p.setting),
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
 * Update settings permissions for a specific admin (superadmin only)
 * Body: { permissions: ['mautic', 'smtp', ...] }
 */
router.put(
  "/admin-permissions/:adminId",
  authenticate,
  authorize("superadmin"),
  async (req, res) => {
    try {
      const { adminId } = req.params;
      const { permissions } = req.body;

      // Validate admin exists and has admin role
      const admin = await prisma.user.findUnique({
        where: { id: parseInt(adminId) },
      });

      if (!admin) {
        return res.status(404).json({
          success: false,
          message: "Admin not found",
        });
      }

      if (admin.role !== "admin") {
        return res.status(400).json({
          success: false,
          message: "User is not an admin",
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
    // Superadmins have access to all settings
    if (req.user.role === "superadmin") {
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

    // For admins, fetch their specific permissions from AdminSettingsPermission table
    if (req.user.role === "admin") {
      const permissions = await prisma.adminSettingsPermission.findMany({
        where: { adminId: req.user.id },
        select: { setting: true },
      });

      return res.json({
        success: true,
        permissions: permissions.map((p) => p.setting),
      });
    }

    // Other roles have no settings access
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
  authorize("superadmin", "admin"),
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
