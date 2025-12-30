import logger from '../utils/logger.js';

/**
 * Custom Application Error Class
 * Provides structured error handling with status codes and error codes
 */
export class AppError extends Error {
  constructor(message, statusCode = 500, code = 'SERVER_ERROR', details = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Common Error Types for quick usage
 */
export class ValidationError extends AppError {
  constructor(message, details = null) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized access') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Access forbidden') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

export class ConflictError extends AppError {
  constructor(message) {
    super(message, 409, 'CONFLICT');
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Too many requests, please try again later') {
    super(message, 429, 'RATE_LIMIT_EXCEEDED');
  }
}

/**
 * Centralized Error Handler Middleware
 * Catches all errors and returns consistent JSON response
 */
export const errorHandler = (err, req, res, next) => {
  let error = err;

  // Handle Prisma errors
  if (err.code === 'P2002') {
    // Unique constraint violation
    const field = err.meta?.target?.[0] || 'field';
    error = new ConflictError(`${field} already exists`);
  } else if (err.code === 'P2025') {
    // Record not found
    error = new NotFoundError('Record');
  } else if (err.code === 'P2003') {
    // Foreign key constraint failed
    error = new ValidationError('Invalid reference to related record');
  }

  // Handle JWT errors
  if (err.name === 'JsonWebTokenError') {
    error = new UnauthorizedError('Invalid token');
  } else if (err.name === 'TokenExpiredError') {
    error = new UnauthorizedError('Token expired');
  }

  // Set defaults for non-operational errors
  const statusCode = error.statusCode || 500;
  const code = error.code || 'SERVER_ERROR';
  // In development, show actual error message; in production, hide non-operational errors
  const message = error.isOperational 
    ? error.message 
    : (process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong');

  // Log error
  if (statusCode >= 500) {
    logger.error('Server Error', {
      message: error.message,
      stack: error.stack,
      code: error.code,
      url: req.originalUrl,
      method: req.method,
      ip: req.ip,
      userId: req.user?.id
    });
  } else {
    logger.warn('Client Error', {
      message: error.message,
      code: error.code,
      url: req.originalUrl,
      method: req.method,
      userId: req.user?.id
    });
  }

  // Send error response
  const response = {
    success: false,
    error: {
      code,
      message,
      ...(error.details && { details: error.details })
    }
  };

  // Include stack trace in development
  if (process.env.NODE_ENV === 'development') {
    response.error.stack = error.stack;
  }

  // Add request ID if available
  if (req.requestId) {
    response.requestId = req.requestId;
  }

  res.status(statusCode).json(response);
};

/**
 * Async Handler Wrapper
 * Eliminates need for try-catch in async route handlers
 */
export const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * 404 Not Found Handler
 * Should be added before error handler
 */
export const notFoundHandler = (req, res, next) => {
  next(new NotFoundError(`Route ${req.originalUrl}`));
};
