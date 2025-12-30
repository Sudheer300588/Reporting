/**
 * Superadmin Routes
 * 
 * Routes for superadmin-only functions:
 * - User management (create, update, toggle active)
 * - Client creation with assignments
 * - View all users, clients, activities
 * - Dashboard statistics
 */

import express from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../prisma/client.js';
import { authenticate as authenticateToken, requireSuperadmin, requireAdmin } from '../middleware/auth.js';
import multer from 'multer';
import { saveFileToFrontendAssets } from '../utils/fileStore.js';
import logger from '../utils/logger.js';
import { notifyClientCreated, notifyClientAssigned, notifyClientUnassigned } from '../utils/emailHelper.js';

const router = express.Router();

// Apply auth middleware to all routes
router.use(authenticateToken);
// Most routes accessible by admin too (set individually where needed)
router.use(requireAdmin);

// ============================================
// DASHBOARD & STATISTICS
// ============================================

/**
 * GET /api/superadmin/dashboard
 * Get dashboard statistics for superadmin
 */
router.get('/dashboard', async (req, res) => {
  try {
    const [
      totalManagers,
      totalEmployees,
      activeClients,
      totalClients,
      recentActivities,
      activeManagers,
      activeEmployees
    ] = await Promise.all([
      prisma.user.count({ where: { role: 'manager' } }),
      prisma.user.count({ where: { role: 'employee' } }),
      prisma.client.count({ where: { isActive: true } }),
      prisma.client.count(),
      prisma.activityLog.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: { name: true, email: true, role: true }
          }
        }
      }),
      prisma.user.count({ where: { role: 'manager', isActive: true } }),
      prisma.user.count({ where: { role: 'employee', isActive: true } })
    ]);

    res.json({
      success: true,
      data: {
        stats: {
          totalManagers,
          totalEmployees,
          totalUsers: totalManagers + totalEmployees,
          activeManagers,
          activeEmployees,
          activeClients,
          totalClients,
          inactiveClients: totalClients - activeClients
        },
        recentActivities
      }
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard statistics',
      error: error.message
    });
  }
});

// ============================================
// USER MANAGEMENT
// ============================================

// ============================================
// SFTP CREDENTIALS MANAGEMENT
// ============================================

/**
 * GET /api/superadmin/sftp-credentials
 * Get current SFTP credentials
 */
router.get('/sftp-credentials', async (req, res) => {
  try {
    const cred = await prisma.sFTPCredential.findFirst({
      orderBy: { updatedAt: 'desc' }
    });
    if (!cred) {
      return res.json({ success: true, data: null });
    }
    res.json({
      success: true,
      data: {
        host: cred.host,
        port: cred.port,
        username: cred.username,
        remotePath: cred.remotePath,
        updatedAt: cred.updatedAt
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch SFTP credentials', error: error.message });
  }
});

/**
 * POST /api/superadmin/sftp-credentials
 * Set or update SFTP credentials
 * Body: { host, port, username, password, remotePath }
 */
router.post('/sftp-credentials', async (req, res) => {
  try {
    let { host, port, username, password, remotePath } = req.body;
    if (!host || !port || !username || !password || !remotePath) {
      return res.status(400).json({ success: false, message: 'All fields are required.' });
    }
    // Trim whitespace from credentials
    host = host.trim();
    username = username.trim();
    password = password.trim();
    remotePath = remotePath.trim();
    // Save new credentials (replace old)
    const cred = await prisma.sFTPCredential.create({
      data: {
        host,
        port: Number(port),
        username,
        password,
        remotePath,
        createdById: req.user?.id || null
      }
    });
    res.json({ success: true, data: { id: cred.id } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to save SFTP credentials', error: error.message });
  }
});

/**
 * POST /api/superadmin/sftp-credentials/test
 * Test SFTP connection with provided credentials
 * Body: { host, port, username, password, remotePath }
 */
router.post('/sftp-credentials/test', async (req, res) => {
  try {
    let { host, port, username, password, remotePath } = req.body;
    
    if (!host || !port || !username || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Host, port, username, and password are required for testing' 
      });
    }

    // Import ssh2-sftp-client dynamically
    const SftpClient = (await import('ssh2-sftp-client')).default;
    const sftp = new SftpClient();

    // Try to connect
    await sftp.connect({
      host: host.trim(),
      port: Number(port),
      username: username.trim(),
      password: password.trim(),
      readyTimeout: 10000,
      retries: 1
    });

    // Try to list directory to verify access
    let dirList = [];
    try {
      dirList = await sftp.list(remotePath?.trim() || '/');
    } catch (listErr) {
      // Directory might not exist or no permission - still a valid connection
      logger.warn('SFTP test: Could not list directory:', listErr.message);
    }

    await sftp.end();

    res.json({ 
      success: true, 
      message: 'SFTP connection successful!',
      details: {
        filesFound: dirList.length,
        remotePath: remotePath || '/'
      }
    });
  } catch (error) {
    logger.error('SFTP test error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to connect to SFTP server',
      error: error.message 
    });
  }
});

// ============================================
// SMTP CREDENTIALS
// ============================================

/**
 * GET /api/superadmin/smtp-credentials
 * Get the latest SMTP credentials
 */
router.get('/smtp-credentials', async (req, res) => {
  try {
    const cred = await prisma.sMTPCredential.findFirst({
      orderBy: { createdAt: 'desc' }
    });
    if (cred) {
      res.json({ success: true, data: cred });
    } else {
      res.json({ success: true, data: null });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch SMTP credentials', error: error.message });
  }
});

/**
 * POST /api/superadmin/smtp-credentials
 * Set or update SMTP credentials
 * Body: { host, port, username, password, fromAddress }
 */
router.post('/smtp-credentials', async (req, res) => {
  try {
    let { host, port, username, password, fromAddress } = req.body;
    if (!host || !port || !username || !password || !fromAddress) {
      return res.status(400).json({ success: false, message: 'All fields are required.' });
    }
    // Trim whitespace from credentials
    host = host.trim();
    username = username.trim();
    password = password.trim();
    fromAddress = fromAddress.trim();
    
    // Save new credentials
    const cred = await prisma.sMTPCredential.create({
      data: {
        host,
        port: Number(port),
        username,
        password,
        fromAddress,
        createdById: req.user?.id || null
      }
    });
    res.json({ success: true, data: { id: cred.id } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to save SMTP credentials', error: error.message });
  }
});

/**
 * POST /api/superadmin/smtp-credentials/test
 * Test SMTP credentials by sending a test email
 * Body: { host, port, username, password, fromAddress, toAddress }
 */
router.post('/smtp-credentials/test', async (req, res) => {
  try {
    const { host, port, username, password, fromAddress, toAddress } = req.body;
    
    if (!host || !port || !username || !password || !fromAddress || !toAddress) {
      return res.status(400).json({ 
        success: false, 
        message: 'All SMTP fields are required for testing' 
      });
    }

    // Import nodemailer dynamically
    const nodemailer = await import('nodemailer');
    
    // Create transporter with provided credentials
    const transporter = nodemailer.default.createTransport({
      host: host.trim(),
      port: Number(port),
      secure: Number(port) === 465, // true for 465, false for other ports
      auth: {
        user: username.trim(),
        pass: password.trim()
      }
    });

    // Send test email
    const info = await transporter.sendMail({
      from: fromAddress.trim(),
      to: toAddress.trim(),
      subject: 'SMTP Configuration Test',
      text: 'This is a test email to verify your SMTP configuration is working correctly.',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2 style="color: #2563eb;">SMTP Configuration Test</h2>
          <p>This is a test email to verify your SMTP configuration is working correctly.</p>
          <p style="color: #16a34a; font-weight: bold;">✓ Your SMTP settings are configured properly!</p>
          <hr style="margin: 20px 0; border: none; border-top: 1px solid #e5e7eb;">
          <p style="color: #6b7280; font-size: 12px;">
            Sent from: ${fromAddress.trim()}<br>
            SMTP Host: ${host.trim()}<br>
            Port: ${port}
          </p>
        </div>
      `
    });

    res.json({ 
      success: true, 
      message: `Test email sent successfully to ${toAddress}`,
      messageId: info.messageId
    });
  } catch (error) {
    console.error('SMTP test error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to send test email',
      error: error.message 
    });
  }
});

// ============================================
// VICIDIAL CREDENTIALS
// ============================================

/**
 * GET /api/superadmin/vicidial-credentials
 * Get the latest Vicidial credentials
 */
router.get('/vicidial-credentials', async (req, res) => {
  try {
    const cred = await prisma.vicidialCredential.findFirst({
      orderBy: { createdAt: 'desc' }
    });
    if (cred) {
      res.json({ success: true, data: cred });
    } else {
      res.json({ success: true, data: null });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch Vicidial credentials', error: error.message });
  }
});

/**
 * POST /api/superadmin/vicidial-credentials
 * Set or update Vicidial credentials
 * Body: { url, username, password }
 */
router.post('/vicidial-credentials', async (req, res) => {
  try {
    let { url, username, password } = req.body;
    if (!url || !username || !password) {
      return res.status(400).json({ success: false, message: 'All fields are required.' });
    }
    // Trim whitespace from credentials
    url = url.trim();
    username = username.trim();
    password = password.trim();
    
    // Save new credentials
    const cred = await prisma.vicidialCredential.create({
      data: {
        url,
        username,
        password,
        createdById: req.user?.id || null
      }
    });
    res.json({ success: true, data: { id: cred.id } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to save Vicidial credentials', error: error.message });
  }
});

/**
 * POST /api/superadmin/vicidial-credentials/test
 * Test Vicidial connection with provided credentials
 * Body: { url, username, password }
 */
router.post('/vicidial-credentials/test', async (req, res) => {
  try {
    let { url, username, password } = req.body;
    
    if (!url || !username || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'URL, username, and password are required for testing' 
      });
    }

    // Build the API test URL (using function=version as a simple test)
    const testUrl = new URL(url.trim());
    testUrl.searchParams.set('user', username.trim());
    testUrl.searchParams.set('pass', password.trim());
    testUrl.searchParams.set('function', 'version');
    testUrl.searchParams.set('source', 'test');

    // Make a request to the Vicidial API
    const response = await fetch(testUrl.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'text/plain'
      },
      signal: AbortSignal.timeout(10000) // 10 second timeout
    });

    const text = await response.text();

    // Check if the response indicates success
    // Vicidial API returns ERROR: for failures
    if (text.includes('ERROR:')) {
      return res.status(400).json({ 
        success: false, 
        message: `Vicidial API error: ${text.trim()}`
      });
    }

    res.json({ 
      success: true, 
      message: 'Vicidial connection successful!',
      details: {
        response: text.substring(0, 200) // First 200 chars of response
      }
    });
  } catch (error) {
    logger.error('Vicidial test error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to connect to Vicidial server',
      error: error.message 
    });
  }
});

/**
 * GET /api/superadmin/users
 * Get all users with their relationships
 */
router.get('/users', async (req, res) => {
  try {
    const { role, status } = req.query;
    
    const where = {};
    if (role) where.role = role;
    if (status === 'active') where.isActive = true;
    if (status === 'inactive') where.isActive = false;

    const users = await prisma.user.findMany({
      where,
      orderBy: [
        { role: 'asc' },
        { name: 'asc' }
      ],
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        createdBy: {
          select: { id: true, name: true }
        },
        managers: {
          select: { id: true, name: true, email: true }
        },
        employees: {
          select: { id: true, name: true, email: true }
        },
        _count: {
          select: {
            userAssignments: true,
            employees: true
          }
        }
      }
    });

    res.json({
      success: true,
      data: users
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users',
      error: error.message
    });
  }
});

/**
 * POST /api/superadmin/users
 * Create a new user (admin, manager, employee, or telecaller)
 * Superadmin can create any role, admin can create roles below them
 */
router.post('/users', async (req, res) => {
  try {
    const { name, email, password, role, managerId, employeeIds, customRoleId } = req.body;

    // Validation
    if (!name || !email || !password || !role) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, password, and role are required'
      });
    }

    // Superadmin can create any role except superadmin, admin can create roles below them
    const allowedRoles = req.user.role === 'superadmin' 
      ? ['admin', 'manager', 'employee', 'telecaller']
      : ['manager', 'employee', 'telecaller'];
    
    if (!allowedRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: `Invalid role. Allowed roles: ${allowedRoles.join(', ')}`
      });
    }

    // Check if email already exists
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Email already exists'
      });
    }

    // Enforce max 1 superadmin (should not be created here, but just in case)
    if (role === 'superadmin') {
      const superAdminCount = await prisma.user.count({
        where: { role: 'superadmin' }
      });
      if (superAdminCount >= 1) {
        return res.status(403).json({
          success: false,
          message: 'Cannot create more than 1 superadmin'
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
          message: 'Cannot create more than 3 admins'
        });
      }
    }

    // Validate customRoleId if provided (superadmin only)
    let validatedCustomRoleId = null;
    if (customRoleId && req.user.role === 'superadmin') {
      const parsedRoleId = parseInt(customRoleId);
      if (isNaN(parsedRoleId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid custom role ID format'
        });
      }
      const customRole = await prisma.role.findUnique({
        where: { id: parsedRoleId }
      });
      if (!customRole) {
        return res.status(400).json({
          success: false,
          message: 'Custom role not found'
        });
      }
      if (!customRole.isActive) {
        return res.status(400).json({
          success: false,
          message: 'Cannot assign inactive custom role'
        });
      }
      validatedCustomRoleId = parsedRoleId;
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role,
        createdById: req.user.id,
        isActive: true,
        // Connect to custom role if validated
        ...(validatedCustomRoleId ? {
          customRoleId: validatedCustomRoleId
        } : {}),
        // Connect to manager if provided (for employees)
        ...(managerId && role === 'employee' ? {
          managers: {
            connect: { id: parseInt(managerId) }
          }
        } : {}),
        // Connect to employees if provided (for managers)
        ...(employeeIds && role === 'manager' ? {
          employees: {
            connect: employeeIds.map(id => ({ id: parseInt(id) }))
          }
        } : {})
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        customRoleId: true,
        customRole: {
          select: { id: true, name: true, fullAccess: true }
        }
      }
    });

    // Log activity
    await prisma.activityLog.create({
      data: {
        userId: req.user.id,
        action: 'user_created',
        description: `Created ${role}: ${name} (${email})`,
        entityType: 'User',
        entityId: user.id
      }
    });

    // Send welcome email with credentials to the new user
    const { notifyUserCreated } = await import('../utils/emailHelper.js');
    notifyUserCreated(user, req.user, password).catch(err => 
      console.error('Failed to send user welcome email:', err.message)
    );

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: user
    });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create user',
      error: error.message
    });
  }
});

/**
 * PATCH /api/superadmin/users/:id/toggle
 * Toggle user active/inactive status
 */
router.patch('/users/:id/toggle', async (req, res) => {
  try {
    const { id } = req.params;

    const currentUser = await prisma.user.findUnique({
      where: { id: parseInt(id) }
    });

    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Don't allow deactivating yourself
    if (currentUser.id === req.user.id) {
      return res.status(400).json({
        success: false,
        message: 'You cannot deactivate your own account'
      });
    }

    const newStatus = !currentUser.isActive;

    const user = await prisma.user.update({
      where: { id: parseInt(id) },
      data: { isActive: newStatus },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true
      }
    });

    // Log activity
    await prisma.activityLog.create({
      data: {
        userId: req.user.id,
        action: 'user_updated',
        description: `${newStatus ? 'Activated' : 'Deactivated'} user: ${user.name}`,
        entityType: 'User',
        entityId: user.id
      }
    });

    // Send email notification to the user
    try {
      const { notifyUserActivated, notifyUserDeactivated } = await import('../utils/emailHelper.js');
      logger.info(`Sending ${newStatus ? 'activation' : 'deactivation'} email to ${user.email}`);
      
      if (newStatus) {
        const result = await notifyUserActivated(user, req.user);
        logger.info(`User activation email result:`, result);
      } else {
        const result = await notifyUserDeactivated(user, req.user);
        logger.info(`User deactivation email result:`, result);
      }
    } catch (emailError) {
      logger.error('Failed to send user status change email:', emailError);
    }

    res.json({
      success: true,
      message: `User ${newStatus ? 'activated' : 'deactivated'} successfully`,
      data: user
    });
  } catch (error) {
    console.error('Error toggling user status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to toggle user status',
      error: error.message
    });
  }
});

/**
 * PATCH /api/superadmin/users/:id
 * Update user details
 */
router.patch('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, role, managerId, employeeIds } = req.body;

    const updateData = {};
    if (name) updateData.name = name;
    if (email) updateData.email = email;
    if (role) updateData.role = role;

    const user = await prisma.user.update({
      where: { id: parseInt(id) },
      data: {
        ...updateData,
        // Update manager relationship for employees
        ...(managerId !== undefined ? {
          managers: managerId ? {
            set: [{ id: parseInt(managerId) }]
          } : {
            set: []
          }
        } : {}),
        // Update employee relationships for managers
        ...(employeeIds !== undefined ? {
          employees: {
            set: employeeIds.map(eid => ({ id: parseInt(eid) }))
          }
        } : {})
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        managers: {
          select: { id: true, name: true }
        },
        employees: {
          select: { id: true, name: true }
        }
      }
    });

    // Log activity
    await prisma.activityLog.create({
      data: {
        userId: req.user.id,
        action: 'user_updated',
        description: `Updated user: ${user.name}`,
        entityType: 'User',
        entityId: user.id
      }
    });

    res.json({
      success: true,
      message: 'User updated successfully',
      data: user
    });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user',
      error: error.message
    });
  }
});

// ============================================
// CLIENT MANAGEMENT WITH ASSIGNMENTS
// ============================================

/**
 * GET /api/superadmin/clients
 * Get all clients with assignments
 */
router.get('/clients', async (req, res) => {
  try {
    const { status, search } = req.query;
    
    const where = {};
    if (status === 'active') where.isActive = true;
    if (status === 'inactive') where.isActive = false;
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { email: { contains: search } },
        { company: { contains: search } }
      ];
    }

    const clients = await prisma.client.findMany({
      where,
      orderBy: [
        { isActive: 'desc' },
        { name: 'asc' }
      ],
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
            },
            assignedBy: {
              select: { id: true, name: true }
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
    });

    res.json({
      success: true,
      data: clients
    });
  } catch (error) {
    console.error('Error fetching clients:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch clients',
      error: error.message
    });
  }
});

/**
 * POST /api/superadmin/clients
 * Create client and assign users in one operation
 */
router.post('/clients', async (req, res) => {
  try {
    const { 
      name, 
      email, 
      phone, 
      company, 
      address, 
      website, 
      description,
      managerId,
      employeeIds = []
    } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Client name is required'
      });
    }

    // Create client with assignments in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create client
      const client = await tx.client.create({
        data: {
          name,
          email,
          phone,
          company,
          address,
          website,
          description,
          clientType: 'general',
          isActive: true,
          createdById: req.user.id
        }
      });

      // Create assignments
      const assignmentPromises = [];
      
      // Assign manager
      if (managerId) {
        assignmentPromises.push(
          tx.clientAssignment.create({
            data: {
              clientId: client.id,
              userId: parseInt(managerId),
              assignedById: req.user.id
            }
          })
        );
      }

      // Assign employees
      for (const employeeId of employeeIds) {
        assignmentPromises.push(
          tx.clientAssignment.create({
            data: {
              clientId: client.id,
              userId: parseInt(employeeId),
              assignedById: req.user.id
            }
          })
        );
      }

      await Promise.all(assignmentPromises);

      // Log activity
      await tx.activityLog.create({
        data: {
          userId: req.user.id,
          action: 'client_created',
          description: `Created client: ${name} with ${assignmentPromises.length} assignments`,
          entityType: 'Client',
          entityId: client.id
        }
      });

      return client;
    });

    // Fetch complete client with assignments
    const client = await prisma.client.findUnique({
      where: { id: result.id },
      include: {
        assignments: {
          include: {
            user: {
              select: { id: true, name: true, email: true, role: true }
            }
          }
        }
      }
    });

    // Send email notifications asynchronously (non-blocking)
    const assignedUsers = client.assignments.map(a => a.user);
    
    // Notify about client creation
    notifyClientCreated(client, req.user)
      .catch(err => logger.error('Failed to send client creation email:', err));
    
    // Notify each assigned user
    for (const user of assignedUsers) {
      notifyClientAssigned(client, user, req.user)
        .catch(err => logger.error(`Failed to send assignment email to ${user.email}:`, err));
    }

    res.status(201).json({
      success: true,
      message: 'Client created and assigned successfully',
      data: client
    });
  } catch (error) {
    console.error('Error creating client:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create client',
      error: error.message
    });
  }
});

/**
 * POST /api/superadmin/clients/:id/assign
 * Assign users to a client
 */
router.post('/clients/:id/assign', async (req, res) => {
  try {
    const { id } = req.params;
    const { userIds } = req.body;

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'User IDs array is required'
      });
    }

    const assignments = await Promise.all(
      userIds.map(userId =>
        prisma.clientAssignment.upsert({
          where: {
            clientId_userId: {
              clientId: parseInt(id),
              userId: parseInt(userId)
            }
          },
          create: {
            clientId: parseInt(id),
            userId: parseInt(userId),
            assignedById: req.user.id
          },
          update: {},
          include: {
            user: {
              select: { id: true, name: true, email: true, role: true }
            }
          }
        })
      )
    );

    // Log activity
    await prisma.activityLog.create({
      data: {
        userId: req.user.id,
        action: 'client_assigned',
        description: `Assigned ${userIds.length} users to client`,
        entityType: 'Client',
        entityId: parseInt(id)
      }
    });

    // Send email notifications to each assigned user
    const client = await prisma.client.findUnique({
      where: { id: parseInt(id) },
      select: { id: true, name: true }
    });
    
    if (client) {
      for (const assignment of assignments) {
        notifyClientAssigned(client, assignment.user, req.user)
          .catch(err => logger.error(`Failed to send assignment email to ${assignment.user.email}:`, err));
      }
    }

    res.json({
      success: true,
      message: 'Users assigned to client successfully',
      data: assignments
    });
  } catch (error) {
    console.error('Error assigning users to client:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to assign users to client',
      error: error.message
    });
  }
});

/**
 * DELETE /api/superadmin/clients/:id/unassign
 * Unassign users from a client
 */
router.delete('/clients/:id/unassign', async (req, res) => {
  try {
    const { id } = req.params;
    const { userIds } = req.body;

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'User IDs array is required'
      });
    }

    // Get client and user details before deletion for email notification
    const client = await prisma.client.findUnique({
      where: { id: parseInt(id) },
      select: { id: true, name: true }
    });
    
    const users = await prisma.user.findMany({
      where: { id: { in: userIds.map(id => parseInt(id)) } },
      select: { id: true, name: true, email: true }
    });

    await prisma.clientAssignment.deleteMany({
      where: {
        clientId: parseInt(id),
        userId: { in: userIds.map(id => parseInt(id)) }
      }
    });

    // Log activity
    await prisma.activityLog.create({
      data: {
        userId: req.user.id,
        action: 'client_unassigned',
        description: `Unassigned ${userIds.length} users from client`,
        entityType: 'Client',
        entityId: parseInt(id)
      }
    });

    // Send email notifications to each unassigned user
    if (client) {
      for (const user of users) {
        notifyClientUnassigned(client, user, req.user)
          .catch(err => logger.error(`Failed to send unassignment email to ${user.email}:`, err));
      }
    }

    res.json({
      success: true,
      message: 'Users unassigned from client successfully'
    });
  } catch (error) {
    console.error('Error unassigning users from client:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to unassign users from client',
      error: error.message
    });
  }
});

// ============================================
// EMPLOYEE LIST VIEW
// ============================================

/**
 * GET /api/superadmin/employees
 * Get detailed employee list with manager info
 */
router.get('/employees', async (req, res) => {
  try {
    const employees = await prisma.user.findMany({
      where: {
        role: { in: ['employee', 'telecaller', 'manager'] }
      },
      orderBy: [
        { role: 'asc' },
        { name: 'asc' }
      ],
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        managers: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        _count: {
          select: {
            userAssignments: true
          }
        }
      }
    });

    res.json({
      success: true,
      data: employees
    });
  } catch (error) {
    console.error('Error fetching employees:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch employees',
      error: error.message
    });
  }
});

// ============================================
// ACTIVITIES
// ============================================

/**
 * GET /api/superadmin/activities
 * Get activity logs
 */
router.get('/activities', async (req, res) => {
  try {
    const { limit = 50, offset = 0, action, userId } = req.query;

    const where = {};
    if (action) where.action = action;
    if (userId) where.userId = parseInt(userId);

    const [activities, total] = await Promise.all([
      prisma.activityLog.findMany({
        where,
        take: parseInt(limit),
        skip: parseInt(offset),
        orderBy: { createdAt: 'desc' },
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
      }),
      prisma.activityLog.count({ where })
    ]);

    res.json({
      success: true,
      data: {
        activities,
        pagination: {
          total,
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: total > parseInt(offset) + parseInt(limit)
        }
      }
    });
  } catch (error) {
    console.error('Error fetching activities:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch activities',
      error: error.message
    });
  }
});

// ============================================
// SYSTEM MAINTENANCE EMAIL
// ============================================

/**
 * POST /api/superadmin/send-maintenance-email
 * Send a maintenance email to all users in the system
 * Body: { subject: string, template: string }
 */
router.post('/send-maintenance-email', async (req, res) => {
  try {
    const { subject, template } = req.body;

    if (!subject || !template) {
      return res.status(400).json({ 
        success: false, 
        message: 'Subject and template are required' 
      });
    }

    // Get all active users
    const users = await prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, email: true, name: true }
    });

    if (users.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'No active users found' 
      });
    }

    // Get SMTP credentials
    const smtpCred = await prisma.sMTPCredential.findFirst({
      orderBy: { updatedAt: 'desc' }
    });

    if (!smtpCred) {
      return res.status(400).json({ 
        success: false, 
        message: 'SMTP not configured. Please configure email settings first.' 
      });
    }

    // Import nodemailer
    const nodemailer = await import('nodemailer');
    
    // Create transporter
    const transporter = nodemailer.default.createTransport({
      host: smtpCred.host,
      port: smtpCred.port,
      secure: smtpCred.port === 465,
      auth: {
        user: smtpCred.username,
        pass: smtpCred.password
      }
    });

    // Send email to all users
    let successCount = 0;
    let failureCount = 0;
    const errors = [];

    for (const user of users) {
      try {
        // Render template with user variables
        const variables = {
          recipient_name: user.name,
          user_name: user.name,
          user_email: user.email
        };
        
        const renderedBody = renderTemplate(template, variables);
        const renderedSubject = renderTemplate(subject, variables);

        const mailOptions = {
          from: smtpCred.fromAddress,
          to: user.email,
          subject: renderedSubject,
          html: wrapInEmailTemplate(renderedBody, renderedSubject)
        };

        await transporter.sendMail(mailOptions);
        successCount++;

        // Log the email
        await prisma.emailLog.create({
          data: {
            action: 'maintenance_email',
            recipientEmail: user.email,
            recipientName: user.name,
            subject: renderedSubject,
            success: true
          }
        });
      } catch (error) {
        failureCount++;
        errors.push({ email: user.email, error: error.message });
        
        // Log the failure
        await prisma.emailLog.create({
          data: {
            action: 'maintenance_email',
            recipientEmail: user.email,
            recipientName: user.name,
            subject: subject,
            success: false,
            errorMessage: error.message
          }
        });
      }
    }

    res.json({ 
      success: true, 
      message: `Emails sent successfully to ${successCount} users${failureCount > 0 ? `, ${failureCount} failed` : ''}`,
      data: {
        totalUsers: users.length,
        successCount,
        failureCount,
        errors: errors.length > 0 ? errors : undefined
      }
    });

  } catch (error) {
    console.error('Error sending maintenance email:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to send maintenance email', 
      error: error.message 
    });
  }
});

// Helper functions for email template rendering
function renderTemplate(template, variables = {}) {
  if (!template) return '';
  
  return template.replace(/{{\s*([\w\.]+)\s*}}/g, (match, key) => {
    const value = variables[key];
    return value !== undefined ? String(value) : match;
  });
}

function wrapInEmailTemplate(content, subject) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f5f7fa; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f5f7fa;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.07);">
          <tr>
            <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px 12px 0 0; padding: 32px 40px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600;">${subject}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <div style="color: #374151; font-size: 15px; line-height: 1.7;">${content}</div>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 40px;">
              <div style="height: 1px; background: linear-gradient(to right, transparent, #e5e7eb, transparent);"></div>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px 40px; text-align: center;">
              <p style="margin: 0 0 12px 0; color: #6b7280; font-size: 13px;">This is an automated notification from your system</p>
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">&copy; ${new Date().getFullYear()} Digital Bevy. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export default router;

// ============================================
// SITE CUSTOMIZATION (branding)
// ============================================

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// New: upload single file to categorized subfolder (favicon|logo|login-bg)
router.post('/site-config/upload', upload.single('file'), async (req, res) => {
  try {
    console.log('[site-config/upload] called by user:', req.user?.id);
    const { type } = req.body; // expected: favicon | logo | loginBg
    console.log('[site-config/upload] type:', type);

    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });

    // map type to subfolder
    let subfolder = 'misc';
    let prefix = 'file';
    if (type === 'favicon') {
      subfolder = 'favicon';
      prefix = 'favicon';
    } else if (type === 'logo') {
      subfolder = 'logos';
      prefix = 'logo';
    } else if (type === 'loginBg') {
      subfolder = 'login-bg';
      prefix = 'loginbg';
    }

    if (!req.file.mimetype.startsWith('image/')) {
      console.warn('[site-config/upload] invalid mimetype', req.file.mimetype);
      return res.status(400).json({ success: false, message: 'Only image uploads are allowed' });
    }

    const targetName = req.body?.targetName;
    const overwrite = req.body?.overwrite === 'true' || req.body?.overwrite === true;
    const alias = req.body?.alias === 'true' || req.body?.alias === true;
    console.log('[site-config/upload] targetName, overwrite, alias:', targetName, overwrite, alias);

    // Build options for saveFileToFrontendAssets
    const saveOpts = { prefix, subfolder };
    if (alias && targetName) {
      // Create a timestamped file and a stable alias name pointing to it (cache-safe)
      saveOpts.createAlias = true;
      saveOpts.aliasName = targetName;
    } else {
      // Default behavior: if targetName provided, write deterministic filename (can be overwritten)
      if (targetName) saveOpts.filename = targetName;
      if (overwrite) saveOpts.overwrite = true;
    }

    const publicPath = await saveFileToFrontendAssets(req.file.buffer, req.file.originalname, saveOpts);
    console.log('[site-config/upload] saved file at', publicPath);
    res.json({ success: true, data: { path: publicPath } });
  } catch (err) {
    console.error('[site-config/upload] error', err);
    res.status(500).json({ success: false, message: 'Failed to upload file', error: err.message });
  }
});

// PUT update site config (upsert semantics for single global config)
router.put('/site-config', async (req, res) => {
  try {
    console.log('[site-config] PUT called by user:', req.user?.id, 'body:', req.body);
    const {
      siteTitle,
      faviconPath,
      logoPath,
      loginBgType,
      loginBgImagePath,
      loginBgColor,
      loginBgGradientFrom,
      loginBgGradientTo
    } = req.body;

    // Retrieve existing
    let existing = await prisma.siteSettings.findFirst();
    if (existing) {
      const updated = await prisma.siteSettings.update({
        where: { id: existing.id },
        data: {
          siteTitle: siteTitle !== undefined ? siteTitle : existing.siteTitle,
          ...(faviconPath !== undefined ? { faviconPath } : {}),
          ...(logoPath !== undefined ? { logoPath } : {}),
          loginBgType: loginBgType || existing.loginBgType,
          ...(loginBgImagePath !== undefined ? { loginBgImagePath } : {}),
          loginBgColor: loginBgColor !== undefined ? loginBgColor : existing.loginBgColor,
          loginBgGradientFrom: loginBgGradientFrom !== undefined ? loginBgGradientFrom : existing.loginBgGradientFrom,
          loginBgGradientTo: loginBgGradientTo !== undefined ? loginBgGradientTo : existing.loginBgGradientTo
        }
      });
      console.log('[site-config] updated:', updated);
      return res.json({ success: true, data: updated });
    }

    // create new
    const created = await prisma.siteSettings.create({
      data: {
        siteTitle,
        faviconPath,
        logoPath,
        loginBgType: loginBgType || 'image',
        loginBgImagePath,
        loginBgColor,
        loginBgGradientFrom,
        loginBgGradientTo,
        createdById: req.user?.id || null
      }
    });
    console.log('[site-config] created:', created);
    res.json({ success: true, data: created });
  } catch (err) {
    console.error('[site-config] error saving config', err);
    res.status(500).json({ success: false, message: 'Failed to save site config', error: err.message });
  }
});

// GET current site customization
router.get('/site-customization', async (req, res) => {
  try {
    console.log('[site-customization] GET called by user:', req.user?.id);
    const site = await prisma.siteSettings.findFirst({ orderBy: { updatedAt: 'desc' } });
    console.log('[site-customization] GET db result:', site);
    res.json({ success: true, data: site });
  } catch (error) {
    console.error('[site-customization] Error fetching site customization:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch site customization', error: error.message });
  }
});

// POST update site customization (multipart: favicon, logo, loginBgImage)
router.post('/site-customization', upload.fields([
  { name: 'favicon', maxCount: 1 },
  { name: 'logo', maxCount: 1 },
  { name: 'loginBgImage', maxCount: 1 }
]), async (req, res) => {
  try {
    const { siteTitle, loginBgType, loginBgColor, loginBgGradientFrom, loginBgGradientTo } = req.body;

    console.log('[site-customization] POST called by user:', req.user?.id);
    console.log('[site-customization] POST body:', { siteTitle, loginBgType, loginBgColor, loginBgGradientFrom, loginBgGradientTo });

    // Save files if provided
    const files = req.files || {};
    console.log('[site-customization] Received files keys:', Object.keys(files));
    let faviconPath, logoPath, loginBgImagePath;
    // Basic validation: ensure uploaded files are images
    if (files.favicon && files.favicon[0]) {
      console.log('[site-customization] favicon file mime:', files.favicon[0].mimetype, 'originalName:', files.favicon[0].originalname);
      if (!files.favicon[0].mimetype.startsWith('image/')) {
        console.warn('[site-customization] favicon invalid mime');
        return res.status(400).json({ success: false, message: 'Favicon must be an image' });
      }
      console.log('[site-customization] Saving favicon...');
      faviconPath = await saveFileToFrontendAssets(files.favicon[0].buffer, files.favicon[0].originalname, { prefix: 'favicon' });
      console.log('[site-customization] Saved favicon path:', faviconPath);
    }
    if (files.logo && files.logo[0]) {
      console.log('[site-customization] logo file mime:', files.logo[0].mimetype, 'originalName:', files.logo[0].originalname);
      if (!files.logo[0].mimetype.startsWith('image/')) {
        console.warn('[site-customization] logo invalid mime');
        return res.status(400).json({ success: false, message: 'Logo must be an image' });
      }
      console.log('[site-customization] Saving logo...');
      logoPath = await saveFileToFrontendAssets(files.logo[0].buffer, files.logo[0].originalname, { prefix: 'logo' });
      console.log('[site-customization] Saved logo path:', logoPath);
    }
    if (files.loginBgImage && files.loginBgImage[0]) {
      console.log('[site-customization] loginBgImage file mime:', files.loginBgImage[0].mimetype, 'originalName:', files.loginBgImage[0].originalname);
      if (!files.loginBgImage[0].mimetype.startsWith('image/')) {
        console.warn('[site-customization] loginBgImage invalid mime');
        return res.status(400).json({ success: false, message: 'Login background must be an image' });
      }
      console.log('[site-customization] Saving loginBgImage...');
      loginBgImagePath = await saveFileToFrontendAssets(files.loginBgImage[0].buffer, files.loginBgImage[0].originalname, { prefix: 'loginbg' });
      console.log('[site-customization] Saved loginBgImage path:', loginBgImagePath);
    }

    // Find existing record
    const existing = await prisma.siteSettings.findFirst();

    if (existing) {
      const updated = await prisma.siteSettings.update({
        where: { id: existing.id },
        data: {
          siteTitle: siteTitle !== undefined ? siteTitle : existing.siteTitle,
          ...(faviconPath ? { faviconPath } : {}),
          ...(logoPath ? { logoPath } : {}),
          loginBgType: loginBgType || existing.loginBgType,
          ...(loginBgImagePath ? { loginBgImagePath } : {}),
          loginBgColor: loginBgColor || existing.loginBgColor,
          loginBgGradientFrom: loginBgGradientFrom || existing.loginBgGradientFrom,
          loginBgGradientTo: loginBgGradientTo || existing.loginBgGradientTo,
          updatedAt: new Date()
        }
      });
      res.json({ success: true, data: updated });
    } else {
      const created = await prisma.siteSettings.create({
        data: {
          siteTitle,
          faviconPath,
          logoPath,
          loginBgType: loginBgType || 'image',
          loginBgImagePath,
          loginBgColor,
          loginBgGradientFrom,
          loginBgGradientTo,
          createdById: req.user?.id || null
        }
      });
      res.json({ success: true, data: created });
    }
  } catch (error) {
    console.error('Error saving site customization:', error);
    res.status(500).json({ success: false, message: 'Failed to save site customization', error: error.message });
  }
});
