import crypto from 'crypto';
import prisma from '../prisma/client.js';
import emailService from './emailNotificationService.js';
import logger from '../utils/logger.js';

/**
 * OTP Service
 * Handles OTP generation, verification, and delivery for:
 * - Login authentication
 * - Password reset
 * - Account verification
 */
class OTPService {
  
  // Configuration
  static OTP_LENGTH = 6;
  static OTP_VALIDITY_MINUTES = 10;
  static MAX_ATTEMPTS = 3;
  static RATE_LIMIT_SECONDS = 60;

  /**
   * Generate a random 6-digit OTP code
   * @returns {string} 6-digit OTP code
   */
  generateOTPCode() {
    return crypto.randomInt(100000, 999999).toString();
  }

  /**
   * Create and send OTP for a user
   * 
   * @param {Object} params
   * @param {string} params.email - User email
   * @param {number} params.userId - User ID (optional for new users)
   * @param {string} params.purpose - OTP purpose (login, password_reset, account_verification)
   * @returns {Promise<Object>} Result object
   */
  async createOTP({ email, userId = null, purpose }) {
    try {
      // Check rate limiting - only allow 1 OTP per minute per email/purpose
      const recentOTP = await prisma.oTP.findFirst({
        where: {
          email,
          purpose,
          createdAt: {
            gte: new Date(Date.now() - OTPService.RATE_LIMIT_SECONDS * 1000)
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      if (recentOTP) {
        const secondsLeft = Math.ceil(
          (OTPService.RATE_LIMIT_SECONDS * 1000 - (Date.now() - recentOTP.createdAt.getTime())) / 1000
        );
        return {
          success: false,
          message: `Please wait ${secondsLeft} seconds before requesting a new OTP`,
          rateLimited: true
        };
      }

      // Generate OTP code
      const code = this.generateOTPCode();
      const expiresAt = new Date(Date.now() + OTPService.OTP_VALIDITY_MINUTES * 60 * 1000);

      // Invalidate any existing pending OTPs for this email/purpose
      await prisma.oTP.updateMany({
        where: {
          email,
          purpose,
          status: 'pending'
        },
        data: {
          status: 'expired'
        }
      });

      // Create new OTP
      const otp = await prisma.oTP.create({
        data: {
          code,
          email,
          userId,
          purpose,
          expiresAt
        }
      });

      // Send OTP via email
      const emailSent = await this.sendOTPEmail({
        email,
        code,
        purpose,
        validityMinutes: OTPService.OTP_VALIDITY_MINUTES
      });

      if (!emailSent.success) {
        logger.error('Failed to send OTP email', { message: emailSent.message, email, purpose });
        return {
          success: false,
          message: 'Failed to send OTP email. Please try again.',
          error: emailSent.message
        };
      }

      logger.info('OTP created and sent', { email, purpose, otpId: otp.id });

      return {
        success: true,
        message: `OTP sent to ${email}. Please check your email.`,
        otpId: otp.id,
        expiresAt: otp.expiresAt
      };

    } catch (error) {
      logger.error('Error creating OTP', { error: error.message, stack: error.stack, email, purpose });
      return {
        success: false,
        message: 'Failed to create OTP',
        error: error.message
      };
    }
  }

  /**
   * Verify OTP code
   * 
   * @param {Object} params
   * @param {string} params.email - User email
   * @param {string} params.code - OTP code to verify
   * @param {string} params.purpose - OTP purpose
   * @returns {Promise<Object>} Verification result with user data
   */
  async verifyOTP({ email, code, purpose }) {
    try {
      // Find the most recent pending OTP for this email/purpose
      const otp = await prisma.oTP.findFirst({
        where: {
          email,
          code,
          purpose,
          status: 'pending'
        },
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              isActive: true
            }
          }
        }
      });

      if (!otp) {
        return {
          success: false,
          message: 'Invalid or expired OTP code',
          verified: false
        };
      }

      // Check if OTP has expired
      if (new Date() > otp.expiresAt) {
        await prisma.oTP.update({
          where: { id: otp.id },
          data: { status: 'expired' }
        });
        return {
          success: false,
          message: 'OTP has expired. Please request a new one.',
          expired: true
        };
      }

      // Check attempt limit
      if (otp.attempts >= otp.maxAttempts) {
        await prisma.oTP.update({
          where: { id: otp.id },
          data: { status: 'failed' }
        });
        return {
          success: false,
          message: 'Maximum verification attempts exceeded. Please request a new OTP.',
          maxAttemptsExceeded: true
        };
      }

      // Increment attempt counter
      await prisma.oTP.update({
        where: { id: otp.id },
        data: { attempts: otp.attempts + 1 }
      });

      // Verify the code
      if (otp.code !== code) {
        const attemptsLeft = otp.maxAttempts - (otp.attempts + 1);
        return {
          success: false,
          message: `Invalid OTP code. ${attemptsLeft} attempts remaining.`,
          attemptsLeft
        };
      }

      // Mark OTP as verified
      await prisma.oTP.update({
        where: { id: otp.id },
        data: {
          status: 'verified',
          verifiedAt: new Date()
        }
      });

      logger.info('OTP verified successfully', { email, purpose, otpId: otp.id });

      return {
        success: true,
        verified: true,
        message: 'OTP verified successfully',
        user: otp.user,
        otpId: otp.id
      };

    } catch (error) {
      logger.error('Error verifying OTP', { error: error.message, stack: error.stack, email, purpose });
      return {
        success: false,
        message: 'Failed to verify OTP',
        error: error.message
      };
    }
  }

  /**
   * Send OTP via email
   * 
   * @param {Object} params
   * @param {string} params.email - Recipient email
   * @param {string} params.code - OTP code
   * @param {string} params.purpose - OTP purpose
   * @param {number} params.validityMinutes - Validity period
   * @returns {Promise<Object>} Send result
   */
  async sendOTPEmail({ email, code, purpose, validityMinutes }) {
    try {
      // Get SMTP credentials directly (bypass notification toggle for critical auth emails)
      const smtpCred = await prisma.sMTPCredential.findFirst({
        orderBy: { updatedAt: 'desc' }
      });
      
      if (!smtpCred) {
        logger.error('No SMTP credentials configured for OTP email', { email, purpose });
        return { success: false, message: 'SMTP not configured' };
      }

      // Import nodemailer dynamically
      const nodemailer = (await import('nodemailer')).default;
      
      // Create transporter
      const transporter = nodemailer.createTransport({
        host: smtpCred.host,
        port: smtpCred.port,
        secure: smtpCred.port === 465,
        auth: {
          user: smtpCred.username,
          pass: smtpCred.password
        }
      });

      // Get user name if exists
      const user = await prisma.user.findUnique({
        where: { email },
        select: { name: true }
      });

      const recipientName = user?.name || email.split('@')[0];

      // Get template from database
      const actionMap = {
        'login': 'otp_login',
        'password_reset': 'otp_password_reset',
        'account_verification': 'otp_account_verification'
      };

      const action = actionMap[purpose] || 'otp_generic';
      
      const template = await prisma.notificationTemplate.findUnique({
        where: { action }
      });

      let subject, htmlBody;

      if (template) {
        // Use template with US timezone
        const variables = {
          recipient_name: recipientName,
          otp_code: code,
          validity_minutes: validityMinutes,
          purpose: purpose.replace(/_/g, ' '),
          timestamp: new Date().toLocaleString('en-US', {
            timeZone: 'America/Los_Angeles',
            dateStyle: 'medium',
            timeStyle: 'short'
          })
        };

        // Simple variable replacement
        subject = template.subject || `Your OTP Code - ${purpose.replace(/_/g, ' ')}`;
        htmlBody = template.template;
        
        for (const [key, value] of Object.entries(variables)) {
          const regex = new RegExp(`{{${key}}}`, 'g');
          subject = subject.replace(regex, value);
          htmlBody = htmlBody.replace(regex, value);
        }
      } else {
        // Fallback template
        subject = `Your OTP Code - ${purpose.replace(/_/g, ' ')}`;
        htmlBody = `
          <div style="text-align: center; padding: 0 20px;">
            
            <!-- Greeting -->
            <p style="margin: 0 0 24px 0; font-size: 16px; color: #374151;">
              Hello <strong>${recipientName}</strong>,
            </p>
            
            <!-- Message -->
            <p style="margin: 0 0 32px 0; font-size: 15px; color: #6b7280; line-height: 1.6;">
              You requested a one-time password for <strong>${purpose.replace(/_/g, ' ')}</strong>.
              <br>Use the code below to proceed:
            </p>
            
            <!-- OTP Code Box -->
            <div style="background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%); border: 2px solid #0ea5e9; border-radius: 12px; padding: 24px; margin: 0 0 32px 0;">
              <div style="font-size: 14px; color: #0369a1; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px; font-weight: 600;">
                Your OTP Code
              </div>
              <div style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #0c4a6e; font-family: 'Courier New', monospace;">
                ${code}
              </div>
            </div>
            
            <!-- Validity Info -->
            <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 6px; padding: 16px; margin: 0 0 24px 0; text-align: left;">
              <p style="margin: 0; font-size: 14px; color: #92400e;">
                ⏱️ <strong>Valid for ${validityMinutes} minutes</strong>
              </p>
              <p style="margin: 8px 0 0 0; font-size: 13px; color: #b45309;">
                This code will expire at ${new Date(Date.now() + validityMinutes * 60 * 1000).toLocaleTimeString()}
              </p>
            </div>
            
            <!-- Security Warning -->
            <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; border-radius: 6px; padding: 16px; text-align: left;">
              <p style="margin: 0 0 8px 0; font-size: 14px; color: #991b1b; font-weight: 600;">
                🔒 Security Notice
              </p>
              <ul style="margin: 0; padding-left: 20px; font-size: 13px; color: #b91c1c; line-height: 1.6;">
                <li>Never share this code with anyone</li>
                <li>Our team will never ask for your OTP</li>
                <li>If you didn't request this, please ignore this email</li>
              </ul>
            </div>
            
            <!-- Help Text -->
            <p style="margin: 24px 0 0 0; font-size: 13px; color: #9ca3af; line-height: 1.5;">
              Having trouble? Contact our support team for assistance.
            </p>
            
          </div>
        `;
      }

      // Send email
      const mailOptions = {
        from: smtpCred.fromAddress,
        to: email,
        subject,
        html: htmlBody
      };

      await transporter.sendMail(mailOptions);

      logger.debug(`✅ OTP email sent to ${email} for ${purpose}`);

      return {
        success: true,
        message: 'OTP email sent successfully'
      };

    } catch (error) {
      logger.error('Error sending OTP email:', error);
      return {
        success: false,
        message: 'Failed to send OTP email',
        error: error.message
      };
    }
  }

  /**
   * Resend OTP (invalidates old one and creates new)
   * 
   * @param {Object} params
   * @param {string} params.email - User email
   * @param {string} params.purpose - OTP purpose
   * @returns {Promise<Object>} Result object
   */
  async resendOTP({ email, purpose }) {
    // Just create a new OTP (createOTP handles invalidating old ones)
    return await this.createOTP({ email, purpose });
  }

  /**
   * Generate OTP - Wrapper method for backward compatibility
   * 
   * @param {string} email - User email
   * @param {string} purpose - OTP purpose
   * @returns {Promise<Object>} Result object
   */
  async generateOTP(email, purpose) {
    return await this.createOTP({ email, purpose });
  }

  /**
   * Clean up expired OTPs (can be called periodically)
   * Removes OTPs older than 24 hours
   */
  async cleanupExpiredOTPs() {
    try {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      
      const result = await prisma.oTP.deleteMany({
        where: {
          createdAt: {
            lt: oneDayAgo
          }
        }
      });

      logger.debug(`🧹 Cleaned up ${result.count} expired OTPs`);
      return { success: true, deleted: result.count };

    } catch (error) {
      logger.error('Error cleaning up OTPs:', error);
      return { success: false, error: error.message };
    }
  }
}

// Export singleton instance
const otpService = new OTPService();
export default otpService;
