import { z } from 'zod';

/**
 * Authentication & User Validation Schemas
 * Using Zod for type-safe runtime validation
 */

// Common field validators
const email = z.string({
  required_error: 'Email is required',
  invalid_type_error: 'Email must be a string'
})
  .trim()
  .min(1, 'Email is required')
  .email('Please enter a valid email address')
  .toLowerCase();

const password = z.string({
  required_error: 'Password is required',
  invalid_type_error: 'Password must be a string'
})
  .min(8, 'Password must be at least 8 characters')
  .max(100, 'Password is too long (max 100 characters)')
  .regex(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).+$/,
    'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special symbol'
  );

const name = z.string({
  required_error: 'Name is required',
  invalid_type_error: 'Name must be a string'
})
  .trim()
  .min(2, 'Name must be at least 2 characters')
  .max(100, 'Name must not exceed 100 characters');

const role = z.enum(['employee', 'manager', 'telecaller', 'admin', 'superadmin'], {
  errorMap: () => ({ message: 'Invalid role' })
});

// Auth Schemas
export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Password is required')
});

export const registerSchema = z.object({
  name,
  email,
  password,
  role: role.optional()
});

// OTP-based signup schemas
export const requestSignupOTPSchema = z.object({
  email
});

export const verifySignupOTPSchema = z.object({
  email,
  code: z.string()
    .length(6, 'OTP must be 6 digits')
    .regex(/^\d+$/, 'OTP must contain only numbers'),
  name,
  password
});

export const resetPasswordRequestSchema = z.object({
  email
});

export const verifyResetOTPSchema = z.object({
  email,
  code: z.string()
    .length(6, 'OTP must be 6 digits')
    .regex(/^\d+$/, 'OTP must contain only numbers')
});

export const resetPasswordSchema = z.object({
  email,
  tempToken: z.string().min(1, 'Verification token is required'),
  newPassword: password
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: password
});

// User Management Schemas
export const createUserSchema = z.object({
  name,
  email,
  password,
  role: role.optional(), // Deprecated: base role is now derived from customRole
  managerId: z.number().int().positive().optional(),
  customRoleId: z.union([z.number().int().positive(), z.string()]), // Required: dynamic role from Settings
  phone: z.string().max(50).optional().nullable(),
  managerIds: z.array(z.union([z.number().int().positive(), z.string()])).optional(),
  sendWelcomeEmail: z.boolean().optional()
});

export const updateUserSchema = z.object({
  name: name.optional(),
  email: email.optional(),
  role: role.optional(),
  isActive: z.boolean().optional(),
  managerId: z.number().int().positive().optional().nullable(),
  customRoleId: z.union([z.number().int().positive(), z.string(), z.null()]).optional(),
  phone: z.string().max(50).optional().nullable(),
  managerIds: z.array(z.union([z.number().int().positive(), z.string()])).optional()
});

// Client Schemas
export const clientIdSchema = z.object({
  id: z.number().int().positive()
});

export const createClientSchema = z.object({
  name: z.string().min(1, 'Client name is required').max(200).trim(),
  type: z.enum(['mautic', 'dropcowboy', 'general']),
  contactEmail: email.optional(),
  contactPhone: z.string().max(20).optional(),
  assignedUsers: z.array(z.number().int().positive()).optional()
});

export const updateClientSchema = z.object({
  name: z.string().min(1).max(200).trim().optional(),
  type: z.enum(['mautic', 'dropcowboy', 'general']).optional(),
  contactEmail: email.optional().nullable(),
  contactPhone: z.string().max(20).optional().nullable(),
  isActive: z.boolean().optional()
});

// Pagination & Query Schemas
export const paginationSchema = z.object({
  page: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().positive()).default('1'),
  limit: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().positive().max(100)).default('20'),
  search: z.string().trim().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional()
});

/**
 * Validation middleware factory
 */
export const validate = (schema) => {
  return (req, res, next) => {
    try {
      const validated = schema.parse(req.body);
      req.body = validated;
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const details = error.errors.map(err => ({
          field: err.path.join('.') || 'unknown',
          message: err.message,
          code: err.code
        }));
        
        // Create a user-friendly summary message
        const firstError = details[0];
        const summaryMessage = details.length === 1 
          ? firstError.message
          : `${details.length} validation errors found`;

        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: summaryMessage,
            details: details
          }
        });
      }
      // Pass non-validation errors to error handler
      next(error);
    }
  };
};

/**
 * Query validation middleware factory
 */
export const validateQuery = (schema) => {
  return (req, res, next) => {
    try {
      const validated = schema.parse(req.query);
      req.query = validated;
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid query parameters',
            details: error.errors.map(err => ({
              field: err.path.join('.'),
              message: err.message
            }))
          }
        });
      }
      next(error);
    }
  };
};

/**
 * Params validation middleware factory
 */
export const validateParams = (schema) => {
  return (req, res, next) => {
    try {
      const validated = schema.parse({
        ...req.params,
        ...(req.params.id && { id: parseInt(req.params.id) })
      });
      req.params = validated;
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid URL parameters',
            details: error.errors.map(err => ({
              field: err.path.join('.'),
              message: err.message
            }))
          }
        });
      }
      next(error);
    }
  };
};

// Assignment Schemas
export const assignClientSchema = z.object({
  userId: z.number().int().positive('User ID must be a positive integer')
});

export const unassignClientSchema = z.object({
  userId: z.number().int().positive('User ID must be a positive integer')
});

// Activity Schemas
export const activityQuerySchema = z.object({
  page: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().positive()).default('1'),
  limit: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().positive().max(100)).default('20'),
  action: z.enum(['user_created', 'user_updated', 'user_deleted', 'client_created', 'client_updated', 'client_deleted', 'client_assigned', 'client_unassigned', 'login', 'logout']).optional(),
  userId: z.string().regex(/^\d+$/).transform(Number).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional()
});

// Notification Schemas
export const notificationIdSchema = z.object({
  id: z.number().int().positive()
});

export const markNotificationReadSchema = z.object({
  notificationIds: z.array(z.number().int().positive()).min(1, 'At least one notification ID is required')
});
