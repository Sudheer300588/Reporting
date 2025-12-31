import axios from 'axios';

/**
 * OTP Service for frontend API calls
 * Handles OTP-based authentication and password reset flows
 */

const otpService = {
  /**
   * Request OTP for passwordless login
   * @param {string} email - User's email address
   * @returns {Promise<Object>} Response with success status and message
   */
  requestOTP: async (email) => {
    try {
      const response = await axios.post('/api/auth/request-otp', { email });
      return {
        success: true,
        data: response.data,
        message: response.data.message || 'OTP sent successfully'
      };
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || 'Failed to send OTP'
      };
    }
  },

  /**
   * Verify OTP and login
   * @param {string} email - User's email address
   * @param {string} code - OTP code
   * @returns {Promise<Object>} Response with token and user data
   */
  verifyOTP: async (email, code) => {
    try {
      const response = await axios.post('/api/auth/verify-otp', { email, code });
      return {
        success: true,
        data: response.data,
        token: response.data.token,
        user: response.data.user
      };
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || 'Invalid or expired OTP'
      };
    }
  },

  /**
   * Request password reset OTP
   * @param {string} email - User's email address
   * @returns {Promise<Object>} Response with success status
   */
  forgotPassword: async (email) => {
    try {
      const response = await axios.post('/api/auth/forgot-password', { email });
      return {
        success: true,
        data: response.data,
        message: response.data.message || 'Password reset OTP sent'
      };
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || 'Failed to send reset OTP'
      };
    }
  },

  /**
   * Verify password reset OTP
   * @param {string} email - User's email address
   * @param {string} code - OTP code
   * @returns {Promise<Object>} Response with temporary token
   */
  verifyResetOTP: async (email, code) => {
    try {
      const response = await axios.post('/api/auth/verify-reset-otp', { email, code });
      return {
        success: true,
        data: response.data,
        tempToken: response.data.tempToken
      };
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || 'Invalid or expired OTP'
      };
    }
  },

  /**
   * Reset password with verified OTP token
   * @param {string} email - User's email address
   * @param {string} tempToken - Temporary token from OTP verification
   * @param {string} newPassword - New password
   * @returns {Promise<Object>} Response with success status
   */
  resetPassword: async (email, tempToken, newPassword) => {
    try {
      const response = await axios.post('/api/auth/reset-password', {
        email,
        tempToken,
        newPassword
      });
      return {
        success: true,
        data: response.data,
        message: response.data.message || 'Password reset successful'
      };
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || 'Failed to reset password'
      };
    }
  },

  /**
   * Resend OTP code
   * @param {string} email - User's email address
   * @param {string} purpose - OTP purpose ('login' or 'password_reset')
   * @returns {Promise<Object>} Response with success status
   */
  resendOTP: async (email, purpose) => {
    try {
      const response = await axios.post('/api/auth/resend-otp', { email, purpose });
      return {
        success: true,
        data: response.data,
        message: response.data.message || 'OTP resent successfully'
      };
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || 'Failed to resend OTP'
      };
    }
  }
};

export default otpService;
