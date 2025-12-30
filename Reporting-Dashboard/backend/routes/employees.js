import express from 'express';
import prisma from '../prisma/client.js';
import { hashPassword, comparePassword } from '../utils/password.js';
import { authenticate, authorize, canManageUser } from '../middleware/auth.js';
import { logActivity } from '../middleware/activityLogger.js';
import { notifyUserCreated } from '../utils/emailHelper.js';
import { validate, validateParams, createUserSchema, updateUserSchema, clientIdSchema } from '../validators/schemas.js';
import logger from '../utils/logger.js';

const router = express.Router();

// @route   POST /api/users
// @desc    Create new employee (SuperAdmin/Admin creates manager/employee/telecaller, Manager creates employee/telecaller)
// @access  Private (SuperAdmin, Admin, Manager)
router.post('/', authenticate, authorize('superadmin', 'admin', 'manager'), validate(createUserSchema), async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    const currentUser = req.user;

    // Role validation based on current user
    if (currentUser.role === 'superadmin' && !['admin', 'manager', 'employee', 'telecaller'].includes(role)) {
      return res.status(403).json({ 
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Superadmins can only create admins, managers, employees or telecallers'
        }
      });
    }

    if (currentUser.role === 'admin' && !['manager', 'employee', 'telecaller'].includes(role)) {
      return res.status(403).json({ 
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Admins can only create managers, employees or telecallers'
        }
      });
    }

    if (currentUser.role === 'manager' && !['employee', 'telecaller'].includes(role)) {
      return res.status(403).json({ 
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Managers can only create employees or telecallers'
        }
      });
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      return res.status(409).json({ 
        success: false,
        error: {
          code: 'USER_EXISTS',
          message: 'User already exists'
        }
      });
    }

    // Enforce max 1 superadmin
    if (role === 'superadmin') {
      const superAdminCount = await prisma.user.count({
        where: { role: 'superadmin' }
      });
      if (superAdminCount >= 1) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'MAX_SUPERADMINS_REACHED',
            message: 'Cannot create more than 1 superadmin'
          }
        });
      }
    }

    // Enforce max 3 admins
    if (role === 'admin') {
      const adminCount = await prisma.user.count({
        where: { role: 'admin' }
      });
      if (adminCount >= 3) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'MAX_ADMINS_REACHED',
            message: 'Cannot create more than 3 admins'
          }
        });
      }
    }

    const hashedPassword = await hashPassword(password);

    const userData = {
      name,
      email,
      password: hashedPassword,
      role,
      createdById: currentUser.id
    };

    // For manager role, set superAdmin if created by superadmin or admin
    if ((currentUser.role === 'superadmin' || currentUser.role === 'admin') && role === 'manager') {
      userData.superAdminId = currentUser.id;
    }

    // Connect managers using M:N relation if creating employee/telecaller
    if (['employee', 'telecaller'].includes(role) && currentUser.role === 'manager') {
      userData.managers = {
        connect: { id: currentUser.id }
      };
    }

    const user = await prisma.user.create({
      data: userData,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        createdBy: {
          select: { id: true, name: true, email: true }
        },
        managers: {
          select: { id: true, name: true, email: true }
        }
      }
    });

    // Log activity
    await logActivity(
      currentUser.id,
      'user_created',
      'user',
      user.id,
      `${currentUser.role} ${currentUser.name} created user ${user.name} with role ${user.role}`,
      { targetRole: user.role, createdByRole: currentUser.role },
      req
    );

    // Send welcome email with credentials to the new user
    notifyUserCreated(user, currentUser, password)
      .then(result => {
        logger.info('User welcome email sent', { result, userId: user.id, userEmail: user.email });
      })
      .catch(err => {
        logger.error('Failed to send user welcome email', { 
          error: err.message, 
          stack: err.stack,
          userId: user.id,
          userEmail: user.email 
        });
      });

    res.status(201).json({
      message: 'User created successfully',
      user
    });
  } catch (error) {
    logger.error('Error creating user', { error: error.message, stack: error.stack, requestedRole: req.body?.role });
    res.status(500).json({ 
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Server error'
      }
    });
  }
});

// @route   GET /api/users
// @desc    Get employees based on role permissions
// @access  Private
router.get('/', authenticate, async (req, res) => {
  try {
    const currentUser = req.user;
    let where = {};

    if (currentUser.role === 'manager') {
      // Manager sees users they created or employees assigned to them
      where = {
        OR: [
          { createdById: currentUser.id },
          { managers: { some: { id: currentUser.id } } }
        ]
      };
    } else if (['employee', 'telecaller'].includes(currentUser.role)) {
      // Employees and telecallers can only see themselves
      where = { id: currentUser.id };
    }
    // SuperAdmin sees all users (no where filter)

    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        createdBy: {
          select: { id: true, name: true, email: true }
        },
        managers: {
          select: { id: true, name: true, email: true }
        },
        employees: {
          select: { id: true, name: true, email: true, role: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({ users });
  } catch (error) {
    logger.error('Error fetching users', { error: error.message, stack: error.stack, requesterId: req.user?.id });
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/users/:id/clients
// @desc    Get clients assigned to a specific employee
// @access  Private
// NOTE: This route MUST come before /:id to avoid route conflicts
router.get('/:id/clients', authenticate, async (req, res) => {
  try {
    const employeeId = parseInt(req.params.id);
    const currentUser = req.user;

    // Check if user has permission to view this employee's clients
    // SuperAdmin can view anyone's clients
    // Manager can view their team members' clients
    // Employee can only view their own clients
    if (currentUser.role === 'employee' || currentUser.role === 'telecaller') {
      if (currentUser.id !== employeeId) {
        return res.status(403).json({ 
          success: false,
          message: 'You can only view your own clients' 
        });
      }
    } else if (currentUser.role === 'manager') {
      // Check if this employee is under this manager
      const employee = await prisma.user.findUnique({
        where: { id: employeeId },
        include: {
          managers: {
            select: { id: true }
          }
        }
      });

      if (!employee) {
        return res.status(404).json({ 
          success: false,
          message: 'Employee not found' 
        });
      }

      const isUnderManager = employee.managers.some(m => m.id === currentUser.id);
      if (!isUnderManager && employee.id !== currentUser.id) {
        return res.status(403).json({ 
          success: false,
          message: 'You can only view clients of employees under your management' 
        });
      }
    }
    // SuperAdmin has no restrictions

    // Fetch clients assigned to this employee
    const assignments = await prisma.clientAssignment.findMany({
      where: { userId: employeeId },
      include: {
        client: {
          include: {
            createdBy: {
              select: { id: true, name: true, email: true }
            },
            assignments: {
              include: {
                user: {
                  select: { id: true, name: true, email: true, role: true }
                }
              }
            }
          }
        },
        assignedBy: {
          select: { id: true, name: true, email: true }
        }
      },
      orderBy: {
        assignedAt: 'desc'
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
    logger.error('Error fetching employee clients', { error: error.message, stack: error.stack, employeeId: req.params.id });
    res.status(500).json({ 
      success: false,
      message: 'Server error', 
      error: error.message 
    });
  }
});

// @route   GET /api/users/:id
// @desc    Get single employee
// @access  Private
router.get('/:id', authenticate, canManageUser, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: parseInt(req.params.id) },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        createdBy: {
          select: { id: true, name: true, email: true }
        },
        managers: {
          select: { id: true, name: true, email: true }
        }
      }
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ user });
  } catch (error) {
    logger.error('Error fetching user', { error: error.message, stack: error.stack, userId: req.params.id });
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/users/:id
// @desc    Update employee
// @access  Private
router.put('/:id', authenticate, canManageUser, async (req, res) => {
  try {
    const { name, email, role, isActive } = req.body;
    const currentUser = req.user;
    const userId = parseInt(req.params.id);

    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Role validation
    if (role && currentUser.role === 'manager' && !['employee', 'telecaller'].includes(role)) {
      return res.status(403).json({ message: 'Managers can only manage employees and telecallers' });
    }

    // Track if isActive status is changing
    const isActiveChanged = typeof isActive === 'boolean' && user.isActive !== isActive;
    const oldIsActive = user.isActive;

    // Build update data
    const updateData = {};
    if (name) updateData.name = name;
    if (email) updateData.email = email;
    if (role && (currentUser.role === 'superadmin' || currentUser.role === 'admin')) updateData.role = role;
    if (typeof isActive === 'boolean') updateData.isActive = isActive;

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        createdBy: {
          select: { id: true, name: true, email: true }
        },
        managers: {
          select: { id: true, name: true, email: true }
        }
      }
    });

    // Log activity
    await logActivity(
      currentUser.id,
      'user_updated',
      'user',
      user.id,
      `${currentUser.role} ${currentUser.name} updated user ${updatedUser.name}`,
      { updatedFields: Object.keys(req.body) },
      req
    );

    // Send email notification if isActive status changed
    if (isActiveChanged) {
      try {
        const { notifyUserActivated, notifyUserDeactivated } = await import('../utils/emailHelper.js');
        logger.info(`Sending ${isActive ? 'activation' : 'deactivation'} email to ${updatedUser.email}`);
        
        if (isActive) {
          const result = await notifyUserActivated(updatedUser, currentUser);
          logger.info(`User activation email result:`, result);
        } else {
          const result = await notifyUserDeactivated(updatedUser, currentUser);
          logger.info(`User deactivation email result:`, result);
        }
      } catch (emailError) {
        logger.error('Failed to send user status change email:', emailError);
      }
    } else if (Object.keys(updateData).length > 0) {
      // Send profile update notification for other changes
      try {
        const { notifyUserUpdated } = await import('../utils/emailHelper.js');
        const updatedFields = Object.keys(updateData);
        logger.info(`Sending profile update email to ${updatedUser.email}`);
        const result = await notifyUserUpdated(updatedUser, currentUser, updatedFields);
        logger.info(`User profile update email result:`, result);
      } catch (emailError) {
        logger.error('Failed to send user profile update email:', emailError);
      }
    }

    res.json({
      message: 'User updated successfully',
      user: updatedUser
    });
  } catch (error) {
    logger.error('Error updating user', { error: error.message, stack: error.stack, userId: req.params.id });
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/users/:id/password
// @desc    Change employee password
// @access  Private (Self only)
router.put('/:id/password', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const currentUser = req.user;
    const userId = parseInt(req.params.id);

    // Users can only change their own password
    if (userId !== currentUser.id) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Verify current password
    const isMatch = await comparePassword(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }

    // Update password
    const hashedPassword = await hashPassword(newPassword);
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword }
    });

    // Log activity
    await logActivity(
      user.id,
      'user_updated',
      'user',
      user.id,
      `User ${user.name} changed their password`,
      { action: 'password_change' },
      req
    );

    // Send email notification
    try {
      const { notifyPasswordChanged } = await import('../utils/emailHelper.js');
      logger.info(`Sending password change notification to ${user.email}`);
      const result = await notifyPasswordChanged(user);
      logger.info(`Password change email result:`, result);
    } catch (emailError) {
      logger.error('Failed to send password change email:', emailError);
    }

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    logger.error('Error changing password', { error: error.message, stack: error.stack, userId: req.params.id });
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE /api/users/:id
// @desc    Delete employee (hard delete with proper cleanup)
// @access  Private
router.delete('/:id', authenticate, canManageUser, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Log activity BEFORE deleting (so we have userId reference)
    await logActivity(
      req.user.id,
      'user_deleted',
      'user',
      user.id,
      `${req.user.role} ${req.user.name} deleted user ${user.name} (${user.email})`,
      {},
      req
    );

    // Cleanup related records in transaction
    await prisma.$transaction(async (tx) => {
      logger.info(`Step 1: Deleting activity logs for user ${userId}`);
      await tx.activityLog.deleteMany({
        where: { userId: userId }
      });

      logger.info(`Step 2: Deleting OTP records for user ${userId}`);
      await tx.oTP.deleteMany({
        where: { userId: userId }
      });

      logger.info(`Step 3: Disconnecting manager-employee relationships for user ${userId}`);
      await tx.$executeRawUnsafe(`DELETE FROM repdtb._ManagerEmployee WHERE A = ${userId} OR B = ${userId}`);

      logger.info(`Step 4: Nullifying createdBy references for users created by ${userId}`);
      await tx.user.updateMany({
        where: { createdById: userId },
        data: { createdById: null }
      });

      logger.info(`Step 5: Nullifying superAdmin references for users managed by ${userId}`);
      await tx.user.updateMany({
        where: { superAdminId: userId },
        data: { superAdminId: null }
      });

      logger.info(`Step 6: Deleting client assignments for user ${userId}`);
      await tx.clientAssignment.deleteMany({
        where: {
          OR: [
            { userId: userId },
            { assignedById: userId }
          ]
        }
      });

      logger.info(`Step 7: Checking if user ${userId} has created clients`);
      const clientCount = await tx.client.count({
        where: { createdById: userId }
      });
      
      if (clientCount > 0) {
        throw new Error(`Cannot delete user: has ${clientCount} clients. Please reassign clients first.`);
      }

      logger.info(`Step 8: Deleting campaigns created by user ${userId}`);
      await tx.campaign.deleteMany({
        where: { createdById: userId }
      });

      logger.info(`Step 9: Nullifying SFTP credentials creator for user ${userId}`);
      await tx.sFTPCredential.updateMany({
        where: { createdById: userId },
        data: { createdById: null }
      });

      logger.info(`Step 10: Nullifying SMTP credentials creator for user ${userId}`);
      await tx.sMTPCredential.updateMany({
        where: { createdById: userId },
        data: { createdById: null }
      });

      logger.info(`Step 11: Nullifying site settings creator for user ${userId}`);
      await tx.siteSettings.updateMany({
        where: { createdById: userId },
        data: { createdById: null }
      });

      logger.info(`Step 12: Finally deleting user ${userId}`);
      await tx.user.delete({
        where: { id: userId }
      });
      
      logger.info(`User ${userId} successfully deleted`);
    });

    // Send email notification to superadmins
    try {
      const { notifyUserDeleted } = await import('../utils/emailHelper.js');
      logger.info(`Sending user deletion notification for ${user.email}`);
      const result = await notifyUserDeleted(user, req.user);
      logger.info(`User deletion email result:`, result);
    } catch (emailError) {
      logger.error('Failed to send user deletion email:', emailError);
    }

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    logger.error('Error deleting user', { error: error.message, stack: error.stack, userId: req.params.id });
    
    // Return specific error message if user has clients
    if (error.message && error.message.includes('Cannot delete user')) {
      return res.status(400).json({ message: error.message });
    }
    
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;