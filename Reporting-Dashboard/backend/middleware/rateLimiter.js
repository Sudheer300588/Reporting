import rateLimit from 'express-rate-limit';
import logger from '../utils/logger.js';

/**
 * Rate limiting middleware to prevent abuse
 */

// General API rate limiter
export const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 10000, // Very generous limit - 10000 requests per minute
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests, please try again later.'
    }
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  handler: (req, res) => {
    logger.warn('Rate limit exceeded', {
      ip: req.ip,
      path: req.path,
      userAgent: req.get('user-agent')
    });
    res.status(429).json({
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests, please try again in a moment.'
      }
    });
  }
});

// Strict rate limiter for authentication endpoints
export const authLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 1000, // 1000 login attempts per 5 minutes
  skipSuccessfulRequests: true, // Don't count successful requests
  message: {
    success: false,
    error: {
      code: 'AUTH_RATE_LIMIT_EXCEEDED',
      message: 'Too many login attempts, please try again in 15 minutes.'
    }
  },
  handler: (req, res) => {
    logger.warn('Auth rate limit exceeded', {
      ip: req.ip,
      email: req.body?.email,
      path: req.path,
      userAgent: req.get('user-agent')
    });
    res.status(429).json({
      success: false,
      error: {
        code: 'AUTH_RATE_LIMIT_EXCEEDED',
        message: 'Too many login attempts. Please try again in 15 minutes.'
      }
    });
  }
});

// Rate limiter for password reset requests
export const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 password reset requests per 15 minutes
  message: {
    success: false,
    error: {
      code: 'PASSWORD_RESET_RATE_LIMIT',
      message: 'Too many password reset requests, please try again later.'
    }
  },
  handler: (req, res) => {
    logger.warn('Password reset rate limit exceeded', {
      ip: req.ip,
      email: req.body?.email,
      path: req.path
    });
    res.status(429).json({
      success: false,
      error: {
        code: 'PASSWORD_RESET_RATE_LIMIT',
        message: 'Too many password reset requests. Please try again later.'
      }
    });
  }
});

// Rate limiter for OTP requests
export const otpLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 10, // 10 OTP requests per 5 minutes
  message: {
    success: false,
    error: {
      code: 'OTP_RATE_LIMIT',
      message: 'Too many OTP requests, please try again in a moment.'
    }
  },
  handler: (req, res) => {
    logger.warn('OTP rate limit exceeded', {
      ip: req.ip,
      email: req.body?.email,
      path: req.path
    });
    res.status(429).json({
      success: false,
      error: {
        code: 'OTP_RATE_LIMIT',
        message: 'Too many OTP requests. Please wait a moment before trying again.'
      }
    });
  }
});

// Rate limiter for signup endpoint
export const signupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // 500 signups per 15 minutes
  message: {
    success: false,
    error: {
      code: 'SIGNUP_RATE_LIMIT',
      message: 'Too many signup attempts, please try again later.'
    }
  },
  handler: (req, res) => {
    logger.warn('Signup rate limit exceeded', {
      ip: req.ip,
      email: req.body?.email,
      path: req.path
    });
    res.status(429).json({
      success: false,
      error: {
        code: 'SIGNUP_RATE_LIMIT',
        message: 'Too many signup attempts. Please try again in an hour.'
      }
    });
  }
});
