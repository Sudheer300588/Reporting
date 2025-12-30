import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, requireAdmin } from '../middleware/auth.js';

const router = express.Router();
const prisma = new PrismaClient();

const PERMISSIONS_SCHEMA = {
  Pages: ["Dashboard", "Clients", "Users", "Services", "Activities", "Settings"],
  Settings: [
    "Roles",
    "Autovation Clients",
    "Notifications",
    "System Maintenance Email",
    "SMTP Credentials",
    "Voicemail SFTP Credentials",
    "Vicidial Credentials",
    "Site Customization",
  ],
  Users: ["Create", "Read", "Update", "Delete"],
  Clients: ["Create", "Read", "Update", "Delete"],
};

router.get('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const roles = await prisma.role.findMany({
      orderBy: [
        { isSystem: 'desc' },
        { name: 'asc' }
      ],
      include: {
        _count: {
          select: { users: true }
        }
      }
    });

    res.json({
      success: true,
      data: roles
    });
  } catch (error) {
    console.error('Error fetching roles:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch roles',
      error: error.message
    });
  }
});

router.get('/schema', authenticate, requireAdmin, async (req, res) => {
  res.json({
    success: true,
    data: PERMISSIONS_SCHEMA
  });
});

router.get('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    const role = await prisma.role.findUnique({
      where: { id: parseInt(id) },
      include: {
        _count: {
          select: { users: true }
        }
      }
    });

    if (!role) {
      return res.status(404).json({
        success: false,
        message: 'Role not found'
      });
    }

    res.json({
      success: true,
      data: role
    });
  } catch (error) {
    console.error('Error fetching role:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch role',
      error: error.message
    });
  }
});

router.post('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const { name, description, fullAccess, permissions } = req.body;

    if (!name || name.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Role name is required'
      });
    }

    const existing = await prisma.role.findUnique({
      where: { name: name.trim() }
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'A role with this name already exists'
      });
    }

    const validatedPermissions = fullAccess 
      ? generateFullPermissions() 
      : validateAndSanitizePermissions(permissions);

    const role = await prisma.role.create({
      data: {
        name: name.trim(),
        description: description || null,
        fullAccess: fullAccess || false,
        permissions: validatedPermissions,
        isSystem: false
      }
    });

    console.log(`Created new role: ${role.name} (ID: ${role.id})`);

    res.status(201).json({
      success: true,
      message: 'Role created successfully',
      data: role
    });
  } catch (error) {
    console.error('Error creating role:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create role',
      error: error.message
    });
  }
});

router.put('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, fullAccess, permissions } = req.body;
    const roleId = parseInt(id);

    const existing = await prisma.role.findUnique({
      where: { id: roleId }
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Role not found'
      });
    }

    if (existing.isSystem) {
      return res.status(403).json({
        success: false,
        message: 'System roles cannot be modified'
      });
    }

    if (name && name.trim() !== existing.name) {
      const nameExists = await prisma.role.findUnique({
        where: { name: name.trim() }
      });
      if (nameExists) {
        return res.status(400).json({
          success: false,
          message: 'A role with this name already exists'
        });
      }
    }

    const validatedPermissions = fullAccess 
      ? generateFullPermissions() 
      : (permissions ? validateAndSanitizePermissions(permissions) : existing.permissions);

    const role = await prisma.role.update({
      where: { id: roleId },
      data: {
        name: name ? name.trim() : existing.name,
        description: description !== undefined ? description : existing.description,
        fullAccess: fullAccess !== undefined ? fullAccess : existing.fullAccess,
        permissions: validatedPermissions
      }
    });

    console.log(`Updated role: ${role.name} (ID: ${role.id})`);

    res.json({
      success: true,
      message: 'Role updated successfully',
      data: role
    });
  } catch (error) {
    console.error('Error updating role:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update role',
      error: error.message
    });
  }
});

router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const roleId = parseInt(id);

    const existing = await prisma.role.findUnique({
      where: { id: roleId },
      include: {
        _count: {
          select: { users: true }
        }
      }
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Role not found'
      });
    }

    if (existing.isSystem) {
      return res.status(403).json({
        success: false,
        message: 'System roles cannot be deleted'
      });
    }

    if (existing._count.users > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete role. ${existing._count.users} user(s) are assigned to this role.`
      });
    }

    await prisma.role.delete({
      where: { id: roleId }
    });

    console.log(`Deleted role: ${existing.name} (ID: ${roleId})`);

    res.json({
      success: true,
      message: 'Role deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting role:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete role',
      error: error.message
    });
  }
});

router.patch('/:id/toggle', authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const roleId = parseInt(id);

    const existing = await prisma.role.findUnique({
      where: { id: roleId }
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Role not found'
      });
    }

    if (existing.isSystem) {
      return res.status(403).json({
        success: false,
        message: 'System roles cannot be deactivated'
      });
    }

    const role = await prisma.role.update({
      where: { id: roleId },
      data: { isActive: !existing.isActive }
    });

    res.json({
      success: true,
      message: `Role ${role.isActive ? 'activated' : 'deactivated'} successfully`,
      data: role
    });
  } catch (error) {
    console.error('Error toggling role:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to toggle role status',
      error: error.message
    });
  }
});

function generateFullPermissions() {
  const perms = {};
  Object.keys(PERMISSIONS_SCHEMA).forEach(module => {
    perms[module] = {};
    PERMISSIONS_SCHEMA[module].forEach(action => {
      perms[module][action] = true;
    });
  });
  return perms;
}

function validateAndSanitizePermissions(permissions) {
  if (!permissions || typeof permissions !== 'object') {
    return {};
  }

  const sanitized = {};
  
  Object.keys(PERMISSIONS_SCHEMA).forEach(module => {
    if (permissions[module] && typeof permissions[module] === 'object') {
      sanitized[module] = {};
      PERMISSIONS_SCHEMA[module].forEach(action => {
        sanitized[module][action] = permissions[module][action] === true;
      });
    } else {
      sanitized[module] = {};
      PERMISSIONS_SCHEMA[module].forEach(action => {
        sanitized[module][action] = false;
      });
    }
  });

  return sanitized;
}

export default router;
