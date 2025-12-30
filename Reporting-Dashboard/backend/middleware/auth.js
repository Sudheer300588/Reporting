import jwt from 'jsonwebtoken';
import prisma from '../prisma/client.js';
import logger from '../utils/logger.js';

/**
 * Unified Authentication & Authorization Middleware
 * Consolidates auth.js and rbac.js with all security best practices
 */

// Validate JWT_SECRET exists - fail fast
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('FATAL: JWT_SECRET environment variable is required');
}

const JWT_OPTIONS = {
  algorithms: ['HS256']
};

/**
 * Generate JWT tokens
 */
export const generateToken = (userId, tokenVersion = 0) => {
  return jwt.sign(
    { 
      userId, 
      tokenVersion,
      type: 'access',
      iat: Math.floor(Date.now() / 1000)
    }, 
    JWT_SECRET, 
    { 
      expiresIn: '7d',
      algorithm: 'HS256'
    }
  );
};

/**
 * Authenticate JWT token - Main auth middleware
 */
export const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'AUTH_TOKEN_MISSING',
          message: 'Authentication token is required'
        }
      });
    }

    // Verify token with explicit algorithm
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET, JWT_OPTIONS);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          error: {
            code: 'AUTH_TOKEN_EXPIRED',
            message: 'Token has expired'
          }
        });
      }
      if (err.name === 'JsonWebTokenError') {
        return res.status(401).json({
          success: false,
          error: {
            code: 'AUTH_TOKEN_INVALID',
            message: 'Invalid token'
          }
        });
      }
      throw err;
    }

    // Verify token type
    if (decoded.type !== 'access') {
      return res.status(401).json({
        success: false,
        error: {
          code: 'AUTH_INVALID_TOKEN_TYPE',
          message: 'Invalid token type'
        }
      });
    }

    // Fetch fresh user data (includes real-time permission changes)
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        tokenVersion: true,
        createdById: true,
        superAdminId: true,
        createdAt: true,
        updatedAt: true
      }
    });

    if (!user) {
      logger.warn('Token valid but user not found', { 
        userId: decoded.userId,
        ip: req.ip 
      });
      return res.status(401).json({
        success: false,
        error: {
          code: 'AUTH_USER_NOT_FOUND',
          message: 'User not found'
        }
      });
    }

    if (!user.isActive) {
      logger.warn('Inactive user attempted access', { 
        userId: user.id,
        email: user.email,
        ip: req.ip 
      });
      return res.status(403).json({
        success: false,
        error: {
          code: 'AUTH_ACCOUNT_INACTIVE',
          message: 'Account is inactive'
        }
      });
    }

    // Token version check for revocation
    if (decoded.tokenVersion !== user.tokenVersion) {
      logger.warn('Token version mismatch - token revoked', { 
        userId: user.id,
        tokenVersion: decoded.tokenVersion,
        currentVersion: user.tokenVersion
      });
      return res.status(401).json({
        success: false,
        error: {
          code: 'AUTH_TOKEN_REVOKED',
          message: 'Token has been revoked'
        }
      });
    }

    req.user = user;
    next();
  } catch (error) {
    logger.error('Authentication error', { 
      error: error.message,
      path: req.path,
      ip: req.ip
    });
    return res.status(500).json({
      success: false,
      error: {
        code: 'AUTH_ERROR',
        message: 'Authentication failed'
      }
    });
  }
};

/**
 * Authorize by role(s)
 * Usage: authorize('superadmin', 'manager')
 */
export const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'AUTH_REQUIRED',
          message: 'Authentication required'
        }
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      logger.warn('Unauthorized role access attempt', {
        userId: req.user.id,
        userRole: req.user.role,
        requiredRoles: allowedRoles,
        path: req.path,
        method: req.method,
        ip: req.ip
      });

      return res.status(403).json({
        success: false,
        error: {
          code: 'AUTH_INSUFFICIENT_PERMISSIONS',
          message: 'Insufficient permissions'
        }
      });
    }

    next();
  };
};

/**
 * Convenience middleware - Require Superadmin
 */
export const requireSuperadmin = authorize('superadmin');

/**
 * Convenience middleware - Require Superadmin or Admin
 */
export const requireAdmin = authorize('superadmin', 'admin');

/**
 * Convenience middleware - Require Manager or above
 */
export const requireManager = authorize('superadmin', 'admin', 'manager');

/**
 * Convenience middleware - Require any authenticated user
 */
export const requireEmployee = authorize('superadmin', 'admin', 'manager', 'employee', 'telecaller');

/**
 * Check if user can manage another user (hierarchy check)
 */
export const canManageUser = async (req, res, next) => {
  try {
    const targetUserId = parseInt(req.params.id || req.body.userId);
    const currentUser = req.user;

    if (isNaN(targetUserId)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_USER_ID',
          message: 'Invalid user ID'
        }
      });
    }

    // Allow self-management (users can view/update their own profile)
    if (targetUserId === currentUser.id) {
      return next();
    }

    // SuperAdmin and Admin can manage anyone
    if (currentUser.role === 'superadmin' || currentUser.role === 'admin') {
      return next();
    }

    // Manager can manage their team
    if (currentUser.role === 'manager') {
      const targetUser = await prisma.user.findUnique({
        where: { id: targetUserId },
        include: {
          managers: {
            where: { id: currentUser.id },
            select: { id: true }
          }
        }
      });

      if (!targetUser) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User not found'
          }
        });
      }

      // Manager can only manage users they created or users assigned to them
      if (targetUser.createdById === currentUser.id || targetUser.managers.length > 0) {
        return next();
      }
    }

    logger.warn('Unauthorized user management attempt', {
      managerId: currentUser.id,
      targetUserId,
      managerRole: currentUser.role
    });

    return res.status(403).json({
      success: false,
      error: {
        code: 'CANNOT_MANAGE_USER',
        message: 'You do not have permission to manage this user'
      }
    });
  } catch (error) {
    logger.error('Error in canManageUser check', { error: error.message });
    return res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Error checking user management permissions'
      }
    });
  }
};

/**
 * Check if user can manage clients
 */
export const canManageClients = (req, res, next) => {
  const { role } = req.user;

  // SuperAdmin, Admin and Manager can manage clients
  if (['superadmin', 'admin', 'manager'].includes(role)) {
    return next();
  }

  logger.warn('Unauthorized client management attempt', {
    userId: req.user.id,
    role: req.user.role,
    path: req.path
  });

  return res.status(403).json({
    success: false,
    error: {
      code: 'CANNOT_MANAGE_CLIENTS',
      message: 'You do not have permission to manage clients'
    }
  });
};

/**
 * Check if user can view clients
 */
export const canViewClients = (req, res, next) => {
  const { role } = req.user;

  // All authenticated users can view clients (with restrictions applied in routes)
  if (['superadmin', 'admin', 'manager', 'employee', 'telecaller'].includes(role)) {
    return next();
  }

  return res.status(403).json({
    success: false,
    error: {
      code: 'CANNOT_VIEW_CLIENTS',
      message: 'You do not have permission to view clients'
    }
  });
};

/**
 * Check if user can access a specific client
 */
export const canAccessClient = async (req, res, next) => {
  try {
    const clientId = parseInt(req.params.id || req.params.clientId || req.body.clientId);

    if (isNaN(clientId)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_CLIENT_ID',
          message: 'Invalid client ID'
        }
      });
    }

    // Superadmin and Admin can access all clients
    if (req.user.role === 'superadmin' || req.user.role === 'admin') {
      return next();
    }

    // Check if user has assignment to this client
    const assignment = await prisma.clientAssignment.findFirst({
      where: {
        clientId: clientId,
        userId: req.user.id
      }
    });

    if (!assignment) {
      logger.warn('Unauthorized client access attempt', {
        userId: req.user.id,
        clientId,
        role: req.user.role
      });

      return res.status(403).json({
        success: false,
        error: {
          code: 'CLIENT_ACCESS_DENIED',
          message: 'You do not have access to this client'
        }
      });
    }

    next();
  } catch (error) {
    logger.error('Error in canAccessClient check', { error: error.message });
    return res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Error checking client access'
      }
    });
  }
};

/**
 * Check if manager can manage a specific employee
 */
export const canManageEmployee = async (req, res, next) => {
  try {
    const employeeId = parseInt(req.params.id || req.params.employeeId || req.body.employeeId);

    if (isNaN(employeeId)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_EMPLOYEE_ID',
          message: 'Invalid employee ID'
        }
      });
    }

    // Superadmin and Admin can manage all employees
    if (req.user.role === 'superadmin' || req.user.role === 'admin') {
      return next();
    }

    // Managers can only manage their assigned employees
    if (req.user.role === 'manager') {
      const employee = await prisma.user.findFirst({
        where: {
          id: employeeId,
          managers: {
            some: { id: req.user.id }
          }
        }
      });

      if (!employee) {
        logger.warn('Unauthorized employee management attempt', {
          managerId: req.user.id,
          employeeId
        });

        return res.status(403).json({
          success: false,
          error: {
            code: 'CANNOT_MANAGE_EMPLOYEE',
            message: 'You can only manage employees assigned to you'
          }
        });
      }

      return next();
    }

    return res.status(403).json({
      success: false,
      error: {
        code: 'INSUFFICIENT_PERMISSIONS',
        message: 'You do not have permission to manage employees'
      }
    });
  } catch (error) {
    logger.error('Error in canManageEmployee check', { error: error.message });
    return res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Error checking employee management permissions'
      }
    });
  }
};

/**
 * Get list of client IDs accessible to current user
 */
export const getAccessibleClientIds = async (userId, role) => {
  try {
    // Superadmin and Admin can access all clients
    if (role === 'superadmin' || role === 'admin') {
      const clients = await prisma.client.findMany({
        select: { id: true }
      });
      return clients.map(c => c.id);
    }

    // Manager/Employee can only access assigned clients
    const assignments = await prisma.clientAssignment.findMany({
      where: { userId: userId },
      select: { clientId: true }
    });

    return assignments.map(a => a.clientId);
  } catch (error) {
    logger.error('Error getting accessible clients', { error: error.message, userId });
    return [];
  }
};

/**
 * Filter clients query based on user role
 */
export const filterClientsByRole = async (req, baseWhere = {}) => {
  if (req.user.role === 'superadmin' || req.user.role === 'admin') {
    return baseWhere;
  }

  const accessibleClientIds = await getAccessibleClientIds(req.user.id, req.user.role);

  return {
    ...baseWhere,
    id: { in: accessibleClientIds }
  };
};

// Legacy alias for backward compatibility
export const auth = authenticate;

export default {
  authenticate,
  auth,
  authorize,
  requireSuperadmin,
  requireManager,
  requireEmployee,
  canManageUser,
  canManageClients,
  canViewClients,
  canAccessClient,
  canManageEmployee,
  getAccessibleClientIds,
  filterClientsByRole,
  generateToken
};
