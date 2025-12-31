/**
 * Manager Routes
 * 
 * Routes for manager-level functions:
 * - View assigned clients
 * - View team members (employees under them)
 * - Assign/unassign employees to clients
 * - Dashboard statistics for their team
 */

import express from 'express';
import prisma from '../prisma/client.js';
import { authenticate as authenticateToken, requireManager } from '../middleware/auth.js';
import { notifyClientAssigned, notifyClientUnassigned } from '../utils/emailHelper.js';
import logger from '../utils/logger.js';

const router = express.Router();

// Apply auth middleware to all routes
router.use(authenticateToken);
router.use(requireManager);

// ============================================
// DASHBOARD & STATISTICS
// ============================================

/**
 * GET /api/manager/dashboard
 * Get dashboard statistics for manager
 */
router.get('/dashboard', async (req, res) => {
  try {
    const [
      myClients,
      myEmployees,
      activeClients,
      recentActivities
    ] = await Promise.all([
      prisma.clientAssignment.count({
        where: { userId: req.user.id }
      }),
      prisma.user.count({
        where: {
          managers: {
            some: { id: req.user.id }
          },
          isActive: true
        }
      }),
      prisma.clientAssignment.count({
        where: {
          userId: req.user.id,
          client: { isActive: true }
        }
      }),
      prisma.activityLog.findMany({
        where: { userId: req.user.id },
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: { name: true, email: true }
          }
        }
      })
    ]);

    res.json({
      success: true,
      data: {
        stats: {
          myClients,
          myEmployees,
          activeClients,
          inactiveClients: myClients - activeClients
        },
        recentActivities
      }
    });
  } catch (error) {
    logger.error('Error fetching manager dashboard', { error: error.message, stack: error.stack, managerId: req.user?.id });
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard statistics',
      error: error.message
    });
  }
});

// ============================================
// CLIENT MANAGEMENT
// ============================================

/**
 * GET /api/manager/clients
 * Get clients assigned to this manager
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
              select: { id: true, name: true, totalContacts: true }
            },
            dropCowboyCampaigns: {
              select: { id: true, campaignName: true }
            },
            _count: {
              select: {
                assignments: true,
                campaigns: true
              }
            }
          }
        }
      },
      orderBy: {
        client: {
          name: 'asc'
        }
      }
    });

    const clients = assignments.map(a => a.client);

    res.json({
      success: true,
      data: clients
    });
  } catch (error) {
    logger.error('Error fetching manager clients', { error: error.message, stack: error.stack, managerId: req.user?.id });
    res.status(500).json({
      success: false,
      message: 'Failed to fetch clients',
      error: error.message
    });
  }
});

// ============================================
// TEAM MANAGEMENT
// ============================================

/**
 * GET /api/manager/team
 * Get employees under this manager
 */
router.get('/team', async (req, res) => {
  try {
    const employees = await prisma.user.findMany({
      where: {
        managers: {
          some: { id: req.user.id }
        }
      },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        _count: {
          select: {
            userAssignments: true
          }
        },
        userAssignments: {
          include: {
            client: {
              select: {
                id: true,
                name: true,
                isActive: true
              }
            }
          }
        }
      }
    });

    res.json({
      success: true,
      data: employees
    });
  } catch (error) {
    logger.error('Error fetching team members', { error: error.message, stack: error.stack, managerId: req.user?.id });
    res.status(500).json({
      success: false,
      message: 'Failed to fetch team members',
      error: error.message
    });
  }
});

/**
 * POST /api/manager/assign-employee
 * Assign one of my employees to one of my clients
 */
router.post('/assign-employee', async (req, res) => {
  try {
    const { employeeId, clientId } = req.body;

    if (!employeeId || !clientId) {
      return res.status(400).json({
        success: false,
        message: 'Employee ID and Client ID are required'
      });
    }

    // Verify employee is under this manager
    const employee = await prisma.user.findFirst({
      where: {
        id: parseInt(employeeId),
        managers: {
          some: { id: req.user.id }
        }
      }
    });

    if (!employee) {
      return res.status(403).json({
        success: false,
        message: 'You can only assign employees under your management'
      });
    }

    // Verify client is assigned to this manager
    const clientAssignment = await prisma.clientAssignment.findFirst({
      where: {
        clientId: parseInt(clientId),
        userId: req.user.id
      }
    });

    if (!clientAssignment) {
      return res.status(403).json({
        success: false,
        message: 'You can only assign employees to clients assigned to you'
      });
    }

    // Create assignment
    const assignment = await prisma.clientAssignment.upsert({
      where: {
        clientId_userId: {
          clientId: parseInt(clientId),
          userId: parseInt(employeeId)
        }
      },
      create: {
        clientId: parseInt(clientId),
        userId: parseInt(employeeId),
        assignedById: req.user.id
      },
      update: {},
      include: {
        user: {
          select: { id: true, name: true, email: true, role: true }
        },
        client: {
          select: { id: true, name: true }
        }
      }
    });

    // Log activity
    await prisma.activityLog.create({
      data: {
        userId: req.user.id,
        action: 'client_assigned',
        description: `Assigned employee ${employee.name} to client`,
        entityType: 'Client',
        entityId: parseInt(clientId)
      }
    });

    // Send email notification
    notifyClientAssigned(assignment.client, assignment.user, req.user).catch(err => 
      logger.error('Failed to send client assignment email', { error: err.message, assignmentId: assignment.id })
    );

    res.json({
      success: true,
      message: 'Employee assigned to client successfully',
      data: assignment
    });
  } catch (error) {
    logger.error('Error assigning employee', { error: error.message, stack: error.stack, employeeId: req.body?.employeeId, clientId: req.body?.clientId });
    res.status(500).json({
      success: false,
      message: 'Failed to assign employee to client',
      error: error.message
    });
  }
});

/**
 * DELETE /api/manager/unassign-employee
 * Unassign one of my employees from one of my clients
 */
router.delete('/unassign-employee', async (req, res) => {
  try {
    const { employeeId, clientId } = req.body;

    if (!employeeId || !clientId) {
      return res.status(400).json({
        success: false,
        message: 'Employee ID and Client ID are required'
      });
    }

    // Verify employee is under this manager
    const employee = await prisma.user.findFirst({
      where: {
        id: parseInt(employeeId),
        managers: {
          some: { id: req.user.id }
        }
      }
    });

    if (!employee) {
      return res.status(403).json({
        success: false,
        message: 'You can only unassign employees under your management'
      });
    }

    // Verify client is assigned to this manager
    const managerAssignment = await prisma.clientAssignment.findFirst({
      where: {
        clientId: parseInt(clientId),
        userId: req.user.id
      }
    });

    if (!managerAssignment) {
      return res.status(403).json({
        success: false,
        message: 'You can only unassign employees from clients assigned to you'
      });
    }

    // Get client details before deletion for email notification
    const client = await prisma.client.findUnique({
      where: { id: parseInt(clientId) },
      select: { id: true, name: true }
    });

    // Remove assignment
    await prisma.clientAssignment.delete({
      where: {
        clientId_userId: {
          clientId: parseInt(clientId),
          userId: parseInt(employeeId)
        }
      }
    });

    // Log activity
    await prisma.activityLog.create({
      data: {
        userId: req.user.id,
        action: 'client_unassigned',
        description: `Unassigned employee ${employee.name} from client`,
        entityType: 'Client',
        entityId: parseInt(clientId)
      }
    });

    // Send email notification
    if (client) {
      notifyClientUnassigned(client, employee, req.user).catch(err => 
        logger.error('Failed to send client unassignment email', { error: err.message, clientId: client.id })
      );
    }

    res.json({
      success: true,
      message: 'Employee unassigned from client successfully'
    });
  } catch (error) {
    logger.error('Error unassigning employee', { error: error.message, stack: error.stack, employeeId: req.body?.employeeId, clientId: req.body?.clientId });
    res.status(500).json({
      success: false,
      message: 'Failed to unassign employee from client',
      error: error.message
    });
  }
});

export default router;
