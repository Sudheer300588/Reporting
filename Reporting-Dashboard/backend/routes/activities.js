import express from 'express';
import prisma from '../prisma/client.js';
import { authenticate, authorize } from '../middleware/auth.js';
import logger from '../utils/logger.js';

const router = express.Router();

// @route   GET /api/activities
// @desc    Get activity logs based on role permissions
// @access  Private
router.get('/', authenticate, async (req, res) => {
  try {
    const currentUser = req.user;
    const { page = 1, limit = 20, target, action } = req.query;
    
    let where = {};

    // Role-based filtering
    if (['employee', 'telecaller'].includes(currentUser.role)) {
      // Employees and telecallers can only see their own activities
      where.userId = currentUser.id;
    } else if (currentUser.role === 'manager') {
      // Managers can see activities of users they manage
      const managedUsers = await prisma.user.findMany({
        where: {
          OR: [
            { managers: { some: { id: currentUser.id } } },
            { createdById: currentUser.id }
          ]
        },
        select: { id: true }
      });
      
      const userIds = [currentUser.id, ...managedUsers.map(user => user.id)];
      where.userId = { in: userIds };
    }
    // Superadmin sees all activities (no where filter)

    // Additional filters
    if (target) where.entityType = target;
    if (action) where.action = action;

    const skip = (page - 1) * limit;
    
    const activities = await prisma.activityLog.findMany({
      where,
      include: {
        user: {
          select: { id: true, name: true, email: true, role: true }
        }
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: parseInt(limit)
    });

    const total = await prisma.activityLog.count({ where });

    res.json({
      activities,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / limit),
        total
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/activities/stats
// @desc    Get activity statistics
// @access  Private (SuperAdmin, Manager)
router.get('/stats', authenticate, authorize('superadmin', 'manager'), async (req, res) => {
  try {
    const currentUser = req.user;
    let where = {};

    if (currentUser.role === 'manager') {
      const managedUsers = await prisma.user.findMany({
        where: {
          OR: [
            { managers: { some: { id: currentUser.id } } },
            { createdById: currentUser.id }
          ]
        },
        select: { id: true }
      });
      
      const userIds = [currentUser.id, ...managedUsers.map(user => user.id)];
      where.userId = { in: userIds };
    }

    const stats = await prisma.activityLog.groupBy({
      by: ['action'],
      where,
      _count: {
        action: true
      },
      orderBy: {
        _count: {
          action: 'desc'
        }
      }
    });

    const recentActivities = await prisma.activityLog.findMany({
      where,
      include: {
        user: {
          select: { id: true, name: true, email: true }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 10
    });

    res.json({
      stats: stats.map(s => ({ action: s.action, count: s._count.action })),
      recentActivities
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
