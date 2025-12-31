/**
 * Centralized error handler for API responses
 * Extracts user-friendly error messages from various error formats
 */

/**
 * Extract error message from API response
 * @param {Error} error - Axios error object
 * @param {string} defaultMessage - Fallback message
 * @returns {string} User-friendly error message
 */
export const getErrorMessage = (error, defaultMessage = 'An error occurred') => {
  // Network error
  if (!error.response) {
    return 'Network error. Please check your connection.';
  }

  const { data } = error.response;

  // Backend validation error with details
  if (data?.error?.code === 'VALIDATION_ERROR' && data?.error?.details?.length > 0) {
    // Return first validation error message
    return data.error.details[0].message;
  }

  // Backend error with message
  if (data?.error?.message) {
    return data.error.message;
  }

  // Legacy format
  if (data?.message) {
    return data.message;
  }

  // HTTP status messages
  const statusMessages = {
    400: 'Invalid request',
    401: 'Please log in to continue',
    403: 'You do not have permission to perform this action',
    404: 'Resource not found',
    409: 'This resource already exists',
    422: 'Invalid data provided',
    429: 'Too many requests. Please try again later',
    500: 'Server error. Please try again later',
    503: 'Service temporarily unavailable'
  };

  return statusMessages[error.response.status] || defaultMessage;
};

/**
 * Extract all validation errors from API response
 * @param {Error} error - Axios error object
 * @returns {Array} Array of validation error objects {field, message}
 */
export const getValidationErrors = (error) => {
  if (!error.response?.data?.error?.details) {
    return [];
  }

  return error.response.data.error.details.map(detail => ({
    field: detail.field,
    message: detail.message
  }));
};

/**
 * Check if error is a validation error
 * @param {Error} error - Axios error object
 * @returns {boolean}
 */
export const isValidationError = (error) => {
  return error.response?.data?.error?.code === 'VALIDATION_ERROR';
};

/**
 * Check if error is a rate limit error
 * @param {Error} error - Axios error object
 * @returns {boolean}
 */
export const isRateLimitError = (error) => {
  return error.response?.status === 429 || 
         error.response?.data?.error?.code?.includes('RATE_LIMIT');
};

/**
 * Check if error is an authentication error
 * @param {Error} error - Axios error object
 * @returns {boolean}
 */
export const isAuthError = (error) => {
  return error.response?.status === 401;
};

/**
 * Format validation errors for display
 * @param {Array} validationErrors - Array of {field, message} objects
 * @returns {string} Formatted error message
 */
export const formatValidationErrors = (validationErrors) => {
  if (!validationErrors || validationErrors.length === 0) {
    return '';
  }

  if (validationErrors.length === 1) {
    return validationErrors[0].message;
  }

  return validationErrors.map(err => `• ${err.message}`).join('\n');
};
