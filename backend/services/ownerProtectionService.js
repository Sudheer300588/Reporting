import prisma from '../prisma/client.js';
import logger from '../utils/logger.js';

let cachedOwner = null;
let cacheTimestamp = null;
const CACHE_TTL_MS = 60000; // 1 minute cache

/**
 * Get the owner user (oldest superadmin by createdAt)
 * Cached for performance with automatic invalidation
 */
export async function getOwner() {
  const now = Date.now();
  
  // Return cached value if fresh
  if (cachedOwner && cacheTimestamp && (now - cacheTimestamp) < CACHE_TTL_MS) {
    return cachedOwner;
  }
  
  try {
    const owner = await prisma.user.findFirst({
      where: { role: 'superadmin' },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, email: true, role: true, createdAt: true }
    });
    
    cachedOwner = owner;
    cacheTimestamp = now;
    return owner;
  } catch (error) {
    logger.error('Failed to fetch owner', { error: error.message });
    return null;
  }
}

/**
 * Invalidate the owner cache (call after user mutations)
 */
export function invalidateOwnerCache() {
  cachedOwner = null;
  cacheTimestamp = null;
}

/**
 * Check if a user ID is the owner
 */
export async function isOwner(userId) {
  const owner = await getOwner();
  return owner && owner.id === parseInt(userId);
}

/**
 * Protect owner from forbidden mutations
 * Returns { allowed: boolean, error?: string }
 */
export async function protectOwnerMutation(targetUserId, proposedChanges = {}) {
  const owner = await getOwner();
  
  // No owner exists yet, allow all operations
  if (!owner) {
    return { allowed: true };
  }
  
  const targetId = parseInt(targetUserId);
  
  // Not targeting owner, allow
  if (owner.id !== targetId) {
    return { allowed: true };
  }
  
  // Targeting owner - check for forbidden mutations
  
  // 1. Deactivation check
  if (proposedChanges.hasOwnProperty('isActive') && proposedChanges.isActive === false) {
    return { 
      allowed: false, 
      error: 'Cannot deactivate the owner account. This is the protected primary administrator account.',
      code: 'OWNER_DEACTIVATION_BLOCKED'
    };
  }
  
  // 2. Deletion check
  if (proposedChanges.isDelete === true) {
    return { 
      allowed: false, 
      error: 'Cannot delete the owner account. This is the protected primary administrator account.',
      code: 'OWNER_DELETION_BLOCKED'
    };
  }
  
  // 3. Role demotion check
  if (proposedChanges.hasOwnProperty('role') && proposedChanges.role !== 'superadmin') {
    return { 
      allowed: false, 
      error: 'Cannot demote the owner from superadmin. This is the protected primary administrator account.',
      code: 'OWNER_DEMOTION_BLOCKED'
    };
  }
  
  // 4. CustomRoleId change that would remove fullAccess
  if (proposedChanges.hasOwnProperty('customRoleId')) {
    if (proposedChanges.customRoleId === null) {
      // Removing custom role - allowed, owner keeps superadmin base role
      return { allowed: true, preserveRole: 'superadmin' };
    }
    
    // Check if new role has fullAccess
    const newRole = await prisma.role.findUnique({
      where: { id: parseInt(proposedChanges.customRoleId) }
    });
    
    if (!newRole || !newRole.fullAccess) {
      return { 
        allowed: false, 
        error: 'Cannot assign a non-admin role to the owner. This is the protected primary administrator account.',
        code: 'OWNER_DEMOTION_BLOCKED'
      };
    }
    
    // New role has fullAccess - allowed but preserve superadmin role
    return { allowed: true, preserveRole: 'superadmin' };
  }
  
  // All other mutations allowed
  return { allowed: true, preserveRole: 'superadmin' };
}

/**
 * Express middleware factory to guard user mutation endpoints
 * Usage: router.put('/:id', ensureOwnerGuard(), ...)
 */
export function ensureOwnerGuard(options = {}) {
  return async (req, res, next) => {
    const userId = req.params.id;
    
    if (!userId) {
      return next();
    }
    
    const proposedChanges = {
      ...req.body,
      isDelete: options.isDelete || false
    };
    
    const result = await protectOwnerMutation(userId, proposedChanges);
    
    if (!result.allowed) {
      return res.status(403).json({ 
        success: false,
        error: {
          code: result.code,
          message: result.error
        },
        message: result.error
      });
    }
    
    // Store preserveRole in request for downstream handlers
    if (result.preserveRole) {
      req.ownerPreserveRole = result.preserveRole;
    }
    
    next();
  };
}

/**
 * Ensure owner's role is preserved in update data
 * Call this before executing user updates
 * This function mutates updateData to guarantee owner protection
 */
export async function ensureOwnerRolePreserved(userId, updateData) {
  const ownerCheck = await isOwner(userId);
  
  if (ownerCheck) {
    // CRITICAL: Always force superadmin role for owner, regardless of what's in updateData
    // This blocks any attempt to demote the owner through any code path
    if (updateData.hasOwnProperty('role') && updateData.role !== 'superadmin') {
      logger.warn('Blocked attempt to change owner role', { 
        userId, 
        attemptedRole: updateData.role 
      });
    }
    updateData.role = 'superadmin';
    
    // Also block isActive = false for owner (defense in depth)
    if (updateData.hasOwnProperty('isActive') && updateData.isActive === false) {
      logger.warn('Blocked attempt to deactivate owner via ensureOwnerRolePreserved', { userId });
      delete updateData.isActive;
    }
    
    logger.info('Owner protection applied', { userId });
  }
  
  return updateData;
}

export default {
  getOwner,
  isOwner,
  invalidateOwnerCache,
  protectOwnerMutation,
  ensureOwnerGuard,
  ensureOwnerRolePreserved
};
