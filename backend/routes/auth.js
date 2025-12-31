import express from 'express';
import prisma from '../prisma/client.js';
import { hashPassword, comparePassword } from '../utils/password.js';
import { authenticate, generateToken } from '../middleware/auth.js';
import { authLimiter, signupLimiter, passwordResetLimiter, otpLimiter } from '../middleware/rateLimiter.js';
import { validate, loginSchema, registerSchema, requestSignupOTPSchema, verifySignupOTPSchema, resetPasswordRequestSchema, verifyResetOTPSchema, resetPasswordSchema, changePasswordSchema } from '../validators/schemas.js';
import { logActivity } from '../middleware/activityLogger.js';
import { notifyUserCreated } from '../utils/emailHelper.js';
import otpService from '../services/otpService.js';
import logger from '../utils/logger.js';

const router = express.Router();

// Dummy hash for timing attack prevention
const DUMMY_HASH = '$2a$10$dummyHashToPreventTimingAttackDummyHashValue';

/**
 * @route   GET /api/auth/signup-allowed
 * @desc    Check if signup is allowed (only for first user)
 * @access  Public
 */
router.get('/signup-allowed', async (req, res) => {
  try {
    const userCount = await prisma.user.count();
    res.json({
      success: true,
      allowed: userCount === 0
    });
  } catch (error) {
    logger.error('Error checking signup status', { error: error.message });
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Server error'
      },
      allowed: false
    });
  }
});

/**
 * @route   POST /api/auth/register
 * @desc    Register new user (only first user becomes superadmin)
 * @access  Public
 */
router.post('/register', signupLimiter, validate(registerSchema), async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'USER_EXISTS',
          message: 'User with this email already exists'
        }
      });
    }

    // Use transaction with serializable isolation to prevent race condition
    const user = await prisma.$transaction(async (tx) => {
      const userCount = await tx.user.count();
      const isFirstUser = userCount === 0;

      // Count superadmins
      const superAdminCount = await tx.user.count({
        where: { role: 'superadmin' }
      });

      // Enforce max 1 superadmin
      if (role === 'superadmin' && superAdminCount >= 1) {
        throw new Error('MAX_SUPERADMINS_REACHED');
      }

      // Count admins
      const adminCount = await tx.user.count({
        where: { role: 'admin' }
      });

      // Enforce max 3 admins
      if (role === 'admin' && adminCount >= 3) {
        throw new Error('MAX_ADMINS_REACHED');
      }

      const hashedPassword = await hashPassword(password);

      return await tx.user.create({
        data: {
          name,
          email,
          password: hashedPassword,
          // if first user -> superadmin
          // otherwise use provided role (but ensure max 3)
          role: isFirstUser ? 'superadmin' : role || 'employee'
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          tokenVersion: true,
          createdAt: true
        }
      });
    }, {
      isolationLevel: 'Serializable'
    });

    // Log activity
    await logActivity(
      user.id,
      'user_created',
      'user',
      user.id,
      `User ${user.name} registered with role ${user.role}`,
      { role: user.role },
      req
    ).catch(err => logger.error('Failed to log activity', { error: err.message }));

    // Send email notification (non-blocking)
    notifyUserCreated(user, user).catch(err =>
      logger.error('Failed to send user creation email', { error: err.message })
    );

    const token = generateToken(user.id, user.tokenVersion);

    logger.info('User registered successfully', { userId: user.id, role: user.role });

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    if (error.message === 'MAX_SUPERADMINS_REACHED') {
      return res.status(403).json({
        success: false,
        error: {
          code: 'MAX_SUPERADMINS_REACHED',
          message: 'Cannot create more than 1 superadmin'
        }
      });
    }

    if (error.message === 'MAX_ADMINS_REACHED') {
      return res.status(403).json({
        success: false,
        error: {
          code: 'MAX_ADMINS_REACHED',
          message: 'Cannot create more than 3 admins'
        }
      });
    }

    logger.error('Registration error', { error: error.message });
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Server error'
      }
    });
  }
});

/**
 * @route   POST /api/auth/login
 * @desc    Login user with email and password
 * @access  Public
 */
router.post('/login', authLimiter, validate(loginSchema), async (req, res) => {
  try {
    const { email, password } = req.body;

    // Fetch user with customRole for permissions
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        name: true,
        email: true,
        password: true,
        role: true,
        isActive: true,
        tokenVersion: true,
        customRoleId: true,
        customRole: {
          select: {
            id: true,
            name: true,
            fullAccess: true,
            isTeamManager: true,
            permissions: true
          }
        }
      }
    });

    // Always perform hash comparison to prevent timing attacks
    const passwordToCompare = user?.password || DUMMY_HASH;
    const isMatch = await comparePassword(password, passwordToCompare);

    // Check all conditions together
    if (!user || !user.isActive || !isMatch) {
      logger.warn('Failed login attempt', { email, ip: req.ip });
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password'
        }
      });
    }

    // Log activity
    await logActivity(
      user.id,
      'login',
      'system',
      null,
      `User ${user.name} logged in`,
      { role: user.role },
      req
    ).catch(err => logger.error('Failed to log activity', { error: err.message }));

    const token = generateToken(user.id, user.tokenVersion);

    logger.info('User logged in successfully', { userId: user.id, role: user.role });

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        customRoleId: user.customRoleId,
        customRole: user.customRole
      }
    });
  } catch (error) {
    logger.error('Login error', { error: error.message });
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Server error'
      }
    });
  }
});

/**
 * @route   POST /api/auth/logout
 * @desc    Logout user (revoke token by incrementing version)
 * @access  Private
 */
router.post('/logout', authenticate, async (req, res) => {
  try {
    // Increment token version to invalidate all existing tokens
    await prisma.user.update({
      where: { id: req.user.id },
      data: { tokenVersion: { increment: 1 } }
    });

    // Log activity
    await logActivity(
      req.user.id,
      'logout',
      'system',
      null,
      `User ${req.user.name} logged out`,
      null,
      req
    ).catch(err => logger.error('Failed to log activity', { error: err.message }));

    logger.info('User logged out successfully', { userId: req.user.id });

    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    logger.error('Logout error', { error: error.message, userId: req.user.id });
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Server error'
      }
    });
  }
});

/**
 * @route   GET /api/auth/me
 * @desc    Get current user info
 * @access  Private
 */
router.get('/me', authenticate, async (req, res) => {
  try {
    // Fetch fresh user data with customRole for permissions
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        customRoleId: true,
        customRole: {
          select: {
            id: true,
            name: true,
            fullAccess: true,
            isTeamManager: true,
            permissions: true
          }
        }
      }
    });

    res.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        customRoleId: user.customRoleId,
        customRole: user.customRole
      }
    });
  } catch (error) {
    logger.error('Get user info error', { error: error.message, userId: req.user.id });
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Server error'
      }
    });
  }
});

// ============================================
// PASSWORD RESET (OTP-BASED)
// ============================================

/**
 * @route   POST /api/auth/forgot-password
 * @desc    Request password reset OTP
 * @access  Public
 */
router.post('/forgot-password', passwordResetLimiter, validate(resetPasswordRequestSchema), async (req, res) => {
  try {
    const { email } = req.body;

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, isActive: true }
    });

    // Don't reveal if user exists or not (security best practice)
    if (!user) {
      logger.warn('Password reset requested for non-existent user', { email, ip: req.ip });
      // Return success anyway to prevent email enumeration
      return res.json({
        success: true,
        message: 'If an account exists with this email, a password reset code has been sent.'
      });
    }

    if (!user.isActive) {
      logger.warn('Password reset requested for inactive user', { email, userId: user.id, ip: req.ip });
      return res.json({
        success: true,
        message: 'If an account exists with this email, a password reset code has been sent.'
      });
    }

    // Create and send OTP
    const result = await otpService.createOTP({
      email: user.email,
      userId: user.id,
      purpose: 'password_reset'
    });

    if (!result.success) {
      // Handle rate limiting
      if (result.rateLimited) {
        return res.status(429).json({
          success: false,
          error: {
            code: 'RATE_LIMITED',
            message: result.message
          }
        });
      }

      // Handle other errors (SMTP, etc)
      return res.status(400).json({
        success: false,
        error: {
          code: 'OTP_SEND_FAILED',
          message: result.message || 'Failed to send verification code'
        }
      });
    }

    logger.info('Password reset OTP sent', { userId: user.id });

    res.json({
      success: true,
      message: 'A verification code has been sent to your email. It will expire in 10 minutes.',
      expiresIn: '10 minutes'
    });

  } catch (error) {
    logger.error('Forgot password error', { error: error.message });
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to process password reset request'
      }
    });
  }
});

/**
 * @route   POST /api/auth/verify-reset-otp
 * @desc    Verify password reset OTP
 * @access  Public
 */
router.post('/verify-reset-otp', otpLimiter, validate(verifyResetOTPSchema), async (req, res) => {
  try {
    const { email, code } = req.body;

    // Verify OTP
    const result = await otpService.verifyOTP({
      email,
      code,
      purpose: 'password_reset'
    });

    if (!result.success || !result.verified) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'OTP_VERIFICATION_FAILED',
          message: result.message
        },
        attemptsLeft: result.attemptsLeft
      });
    }

    logger.info('Password reset OTP verified', { email });

    res.json({
      success: true,
      message: 'Code verified successfully',
      tempToken: code // Return code as temp token for final step
    });

  } catch (error) {
    logger.error('Verify reset OTP error', { error: error.message });
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to verify code'
      }
    });
  }
});

/**
 * @route   POST /api/auth/reset-password
 * @desc    Reset password using verified OTP
 * @access  Public
 */
router.post('/reset-password', validate(resetPasswordSchema), async (req, res) => {
  try {
    const { email, tempToken, newPassword } = req.body;

    // Check if OTP exists and is already verified (from verify-reset-otp step)
    const otp = await prisma.oTP.findFirst({
      where: {
        email,
        code: tempToken,
        purpose: 'password_reset',
        status: 'verified'
      },
      include: {
        user: {
          select: { id: true }
        }
      },
      orderBy: { verifiedAt: 'desc' }
    });

    if (!otp) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: 'Invalid or expired verification token'
        }
      });
    }

    // Check if OTP is expired (10 minutes from creation)
    const expirationTime = new Date(otp.createdAt.getTime() + 10 * 60 * 1000);
    if (new Date() > expirationTime) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: 'Verification token has expired. Please request a new one.'
        }
      });
    }

    if (!otp.user) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found'
        }
      });
    }

    // Hash new password
    const hashedPassword = await hashPassword(newPassword);

    // Update password and increment token version (invalidate all sessions)
    await prisma.user.update({
      where: { id: otp.user.id },
      data: {
        password: hashedPassword,
        tokenVersion: { increment: 1 }
      }
    });

    // Mark OTP as expired (consumed)
    await prisma.oTP.update({
      where: { id: otp.id },
      data: { status: 'expired' }
    });

    logger.info('Password reset successfully', { userId: otp.user.id });

    res.json({
      success: true,
      message: 'Password reset successfully. Please login with your new password.'
    });

  } catch (error) {
    logger.error('Reset password error', {
      error: error.message,
      stack: error.stack,
      email: req.body.email
    });
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: process.env.NODE_ENV === 'development'
          ? `Failed to reset password: ${error.message}`
          : 'Failed to reset password'
      }
    });
  }
});

/**
 * @route   POST /api/auth/change-password
 * @desc    Change password for authenticated user
 * @access  Private
 */
router.post('/change-password', authenticate, validate(changePasswordSchema), async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    // Fetch current password
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { password: true }
    });

    // Verify current password
    const isMatch = await comparePassword(currentPassword, user.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_CURRENT_PASSWORD',
          message: 'Current password is incorrect'
        }
      });
    }

    // Hash new password
    const hashedPassword = await hashPassword(newPassword);

    // Update password and increment token version
    await prisma.user.update({
      where: { id: req.user.id },
      data: {
        password: hashedPassword,
        tokenVersion: { increment: 1 }
      }
    });

    logger.info('Password changed successfully', { userId: req.user.id });

    res.json({
      success: true,
      message: 'Password changed successfully. Please login again.'
    });

  } catch (error) {
    logger.error('Change password error', { error: error.message, userId: req.user.id });
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to change password'
      }
    });
  }
});

/**
 * @route   POST /api/auth/revoke-all-sessions
 * @desc    Revoke all active sessions (logout from all devices)
 * @access  Private
 */
router.post('/revoke-all-sessions', authenticate, async (req, res) => {
  try {
    // Increment token version to invalidate all tokens
    await prisma.user.update({
      where: { id: req.user.id },
      data: { tokenVersion: { increment: 1 } }
    });

    logger.info('All sessions revoked', { userId: req.user.id });

    res.json({
      success: true,
      message: 'All sessions have been revoked. Please login again.'
    });

  } catch (error) {
    logger.error('Revoke sessions error', { error: error.message, userId: req.user.id });
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to revoke sessions'
      }
    });
  }
});

export default router;
