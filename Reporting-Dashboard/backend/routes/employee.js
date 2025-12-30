/**
 * Employee Routes
 * 
 * Routes for employee-level functions:
 * - View assigned clients (read-only)
 * - View client details and campaign data
 */

import express from 'express';
import prisma from '../prisma/client.js';
import { authenticate as authenticateToken, requireEmployee } from '../middleware/auth.js';
import logger from '../utils/logger.js';

const router = express.Router();

// Apply auth middleware to all routes
router.use(authenticateToken);
router.use(requireEmployee);

// ============================================
// CLIENT ACCESS (Read-Only)
// ============================================

/**
 * GET /api/employee/clients
 * Get clients assigned to this employee
 */
router.get('/clients', async (req, res) => {
  try {
    const { status } = req.query;
    
    const where = {
      userId: req.user.id
    };
    
    if (status === 'active') where.client = { isActive: true };
    if (status === 'inactive') where.client = { isActive: false };

    const assignments = await prisma.clientAssignment.findMany({
      where,
      include: {
        client: {
          include: {
            createdBy: {
              select: { id: true, name: true }
            },
            assignments: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                    role: true
                  }
                }
              }
            },
            mauticClient: {
              select: { 
                id: true, 
                name: true, 
                mauticUrl: true,
                totalContacts: true,
                totalEmails: true,
                totalCampaigns: true,
                totalSegments: true,
                lastSyncAt: true
              }
            },
            dropCowboyCampaigns: {
              select: { 
                id: true, 
                campaignName: true,
                campaignId: true,
                status: true
              }
            },
            _count: {
              select: {
                assignments: true,
                campaigns: true
              }
            }
          }
        },
        assignedBy: {
          select: { id: true, name: true, email: true }
        }
      },
      orderBy: {
        client: {
          name: 'asc'
        }
      }
    });

    const clients = assignments.map(a => ({
      ...a.client,
      assignmentInfo: {
        assignedAt: a.assignedAt,
        assignedBy: a.assignedBy
      }
    }));

    res.json({
      success: true,
      data: clients
    });
  } catch (error) {
    logger.error('Error fetching employee clients', { error: error.message, stack: error.stack, employeeId: req.user?.id });
    res.status(500).json({
      success: false,
      message: 'Failed to fetch clients',
      error: error.message
    });
  }
});

/**
 * GET /api/employee/dashboard
 * Get simple dashboard stats for employee
 */
router.get('/dashboard', async (req, res) => {
  try {
    const [
      myClients,
      activeClients
    ] = await Promise.all([
      prisma.clientAssignment.count({
        where: { userId: req.user.id }
      }),
      prisma.clientAssignment.count({
        where: {
          userId: req.user.id,
          client: { isActive: true }
        }
      })
    ]);

    res.json({
      success: true,
      data: {
        stats: {
          myClients,
          activeClients,
          inactiveClients: myClients - activeClients
        }
      }
    });
  } catch (error) {
    logger.error('Error fetching employee dashboard', { error: error.message, stack: error.stack, employeeId: req.user?.id });
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard statistics',
      error: error.message
    });
  }
});

export default router;
