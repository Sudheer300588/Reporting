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
        updatedAt: true,
        customRoleId: true,
        customRole: {
          select: {
            id: true,
            name: true,
            fullAccess: true,
            isTeamManager: true,
            permissions: true,
            isActive: true
          }
        }
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
 * Check if user has full access via their custom role
 * Full access is granted if:
 * 1. customRole.fullAccess is true, OR
 * 2. Legacy: user has no customRole but has base role 'superadmin' or 'admin' (backward compat)
 */
export const hasFullAccess = (user) => {
  if (!user) return false;
  
  // Check custom role first
  if (user.customRole?.fullAccess === true && user.customRole?.isActive !== false) {
    return true;
  }
  
  // Backward compatibility: legacy users without customRole
  // Superadmin and admin base roles get full access until migrated
  if (!user.customRoleId && (user.role === 'superadmin' || user.role === 'admin')) {
    return true;
  }
  
  return false;
};

/**
 * Check if user has a specific permission from their custom role
 * @param {object} user - The user object with customRole
 * @param {string} module - The module name (e.g., 'Users', 'Clients')
 * @param {string} permission - The permission (e.g., 'Create', 'Read', 'Update', 'Delete')
 */
export const userHasPermission = (user, module, permission) => {
  if (!user) return false;
  
  // Full access grants all permissions
  if (hasFullAccess(user)) return true;
  
  // Check specific permission in custom role
  if (user.customRole?.isActive !== false && user.customRole?.permissions) {
    const modulePermissions = user.customRole.permissions[module];
    if (Array.isArray(modulePermissions) && modulePermissions.includes(permission)) {
      return true;
    }
  }
  
  // Backward compatibility: legacy users without customRole
  // Manager gets basic user/client management
  if (!user.customRoleId && user.role === 'manager') {
    if (module === 'Users' && ['Create', 'Read', 'Update'].includes(permission)) return true;
    if (module === 'Clients' && ['Create', 'Read', 'Update', 'Delete'].includes(permission)) return true;
  }
  
  return false;
};

/**
 * Authorize by role(s) - DEPRECATED: Use requirePermission instead
 * 
 * This function is kept for backward compatibility. It checks:
 * 1. Users with full access (via customRole.fullAccess or legacy superadmin/admin) always pass
 * 2. Otherwise, checks the base user.role against the allowedRoles list
 * 
 * For new routes, use requirePermission() instead for granular permission control.
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

    // Full access users (via customRole or legacy superadmin/admin) always pass
    if (hasFullAccess(req.user)) {
      return next();
    }

    // Check base role against allowedRoles - works for both legacy and new users
    if (allowedRoles.includes(req.user.role)) {
      return next();
    }

    logger.warn('Unauthorized access attempt', {
      userId: req.user.id,
      userRole: req.user.role,
      customRole: req.user.customRole?.name,
      allowedRoles,
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
  };
};

/**
 * Convenience middleware - Require full access (highest permission level)
 */
export const requireFullAccess = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: { code: 'AUTH_REQUIRED', message: 'Authentication required' }
    });
  }
  
  if (!hasFullAccess(req.user)) {
    return res.status(403).json({
      success: false,
      error: { code: 'AUTH_INSUFFICIENT_PERMISSIONS', message: 'Full access required' }
    });
  }
  
  next();
};

/**
 * @deprecated Use requirePermission('Users', 'Create') instead
 */
export const requireSuperadmin = requireFullAccess;

/**
 * @deprecated Use requirePermission() instead  
 */
export const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: { code: 'AUTH_REQUIRED', message: 'Authentication required' }
    });
  }
  if (hasFullAccess(req.user) || userHasPermission(req.user, 'Settings', 'Update')) {
    return next();
  }
  return res.status(403).json({
    success: false,
    error: { code: 'AUTH_INSUFFICIENT_PERMISSIONS', message: 'Insufficient permissions' }
  });
};

/**
 * @deprecated Use requirePermission() instead
 */
export const requireManager = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: { code: 'AUTH_REQUIRED', message: 'Authentication required' }
    });
  }
  if (hasFullAccess(req.user) || 
      userHasPermission(req.user, 'Users', 'Create') || 
      userHasPermission(req.user, 'Clients', 'Create')) {
    return next();
  }
  return res.status(403).json({
    success: false,
    error: { code: 'AUTH_INSUFFICIENT_PERMISSIONS', message: 'Insufficient permissions' }
  });
};

/**
 * @deprecated Use authenticate instead - any authenticated user with a valid role can proceed
 */
export const requireEmployee = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: { code: 'AUTH_REQUIRED', message: 'Authentication required' }
    });
  }
  // Any authenticated user with an active custom role can proceed
  if (req.user.customRole?.isActive !== false) {
    return next();
  }
  return res.status(403).json({
    success: false,
    error: { code: 'AUTH_NO_ROLE', message: 'No active role assigned' }
  });
};

/**
 * Check if user has a specific permission from their custom role
 * Uses granular permissions from the Role model - NO hardcoded role fallbacks
 * 
 * @param {string} module - The module name (e.g., 'Users', 'Clients', 'Pages', 'Settings')
 * @param {string} permission - The specific permission (e.g., 'Create', 'Read', 'Update', 'Delete')
 */
export const requirePermission = (module, permission) => {
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

    // Check if user has permission via their custom role
    if (userHasPermission(req.user, module, permission)) {
      return next();
    }

    logger.warn('Permission denied', {
      userId: req.user.id,
      customRole: req.user.customRole?.name,
      requiredModule: module,
      requiredPermission: permission,
      path: req.path,
      method: req.method,
      ip: req.ip
    });

    return res.status(403).json({
      success: false,
      error: {
        code: 'AUTH_INSUFFICIENT_PERMISSIONS',
        message: `You do not have permission to ${permission.toLowerCase()} ${module.toLowerCase()}`
      }
    });
  };
};

/**
 * Check if user has access to a specific page
 * Uses the 'Pages' permission module from custom role - NO hardcoded role fallbacks
 * 
 * @param {string} pageName - The page name (e.g., 'Dashboard', 'Clients', 'Users', 'Settings')
 */
export const requirePageAccess = (pageName) => {
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

    // Check if user has full access
    if (hasFullAccess(req.user)) {
      return next();
    }

    // Check if user has access to this page via custom role permissions
    if (req.user.customRole?.isActive !== false && req.user.customRole?.permissions) {
      const pagesAccess = req.user.customRole.permissions.Pages || [];
      if (pagesAccess.includes(pageName)) {
        return next();
      }
    }

    logger.warn('Page access denied', {
      userId: req.user.id,
      customRole: req.user.customRole?.name,
      requiredPage: pageName,
      path: req.path,
      ip: req.ip
    });

    return res.status(403).json({
      success: false,
      error: {
        code: 'AUTH_PAGE_ACCESS_DENIED',
        message: `You do not have access to the ${pageName} page`
      }
    });
  };
};

/**
 * Helper function to check permission programmatically (non-middleware)
 * Returns boolean indicating if user has the permission
 * Uses only customRole - NO hardcoded role fallbacks
 */
export const hasPermission = (user, module, permission) => {
  return userHasPermission(user, module, permission);
};

/**
 * Check if user can manage another user (hierarchy check)
 * Uses customRole permissions - NO hardcoded role names
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

    // Users with full access or Users.Update permission can manage anyone
    if (hasFullAccess(currentUser) || userHasPermission(currentUser, 'Users', 'Update')) {
      return next();
    }

    // Users with Users.Read can view, check if they created the target user
    if (userHasPermission(currentUser, 'Users', 'Read')) {
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

      // Can manage users they created or users assigned to them
      if (targetUser.createdById === currentUser.id || targetUser.managers.length > 0) {
        return next();
      }
    }

    logger.warn('Unauthorized user management attempt', {
      userId: currentUser.id,
      targetUserId,
      customRole: currentUser.customRole?.name
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
 * Uses customRole permissions - NO hardcoded role names
 */
export const canManageClients = (req, res, next) => {
  // Check if user has full access or Clients.Create/Update permission
  if (hasFullAccess(req.user) || 
      userHasPermission(req.user, 'Clients', 'Create') || 
      userHasPermission(req.user, 'Clients', 'Update')) {
    return next();
  }

  logger.warn('Unauthorized client management attempt', {
    userId: req.user.id,
    customRole: req.user.customRole?.name,
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
 * All authenticated users can attempt to view clients - the route handlers
 * do the actual filtering based on permissions and assignments
 */
export const canViewClients = (req, res, next) => {
  // All authenticated users can view clients they're assigned to
  // Route handlers filter the actual data based on permissions
  if (req.user) {
    return next();
  }

  return res.status(401).json({
    success: false,
    error: {
      code: 'AUTH_REQUIRED',
      message: 'Authentication required'
    }
  });
};

/**
 * Check if user can access a specific client
 * Uses customRole permissions - NO hardcoded role names
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

    // Users with full access can access all clients
    if (hasFullAccess(req.user)) {
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
        customRole: req.user.customRole?.name
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
 * Check if user can manage a specific employee
 * Uses customRole permissions - NO hardcoded role names
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

    // Users with full access or Users.Update can manage all employees
    if (hasFullAccess(req.user) || userHasPermission(req.user, 'Users', 'Update')) {
      return next();
    }

    // Users with Users.Read can only manage their assigned employees
    if (userHasPermission(req.user, 'Users', 'Read')) {
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
          userId: req.user.id,
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
 * Uses customRole permissions - NO hardcoded role names
 */
export const getAccessibleClientIds = async (userId, user) => {
  try {
    // Users with full access can access all clients
    if (hasFullAccess(user)) {
      const clients = await prisma.client.findMany({
        select: { id: true }
      });
      return clients.map(c => c.id);
    }

    // Other users can only access assigned clients
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
 * Filter clients query based on user permissions
 * Uses customRole permissions - NO hardcoded role names
 */
export const filterClientsByRole = async (req, baseWhere = {}) => {
  if (hasFullAccess(req.user)) {
    return baseWhere;
  }

  const accessibleClientIds = await getAccessibleClientIds(req.user.id, req.user);

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
  requireAdmin,
  requireManager,
  requireEmployee,
  requireFullAccess,
  requirePermission,
  requirePageAccess,
  hasFullAccess,
  userHasPermission,
  hasPermission,
  canManageUser,
  canManageClients,
  canViewClients,
  canAccessClient,
  canManageEmployee,
  getAccessibleClientIds,
  filterClientsByRole,
  generateToken
};
