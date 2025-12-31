/**
 * Mautic Helper Functions
 * 
 * Utility functions for formatting and data manipulation
 */

/**
 * Format a number with thousand separators
 * @param {number} num - Number to format
 * @returns {string} Formatted number
 */
export function formatNumber(num) {
  if (num === null || num === undefined) return '0';
  return num.toLocaleString();
}

/**
 * Format a percentage
 * @param {number} value - Value to format
 * @param {number} decimals - Number of decimal places
 * @returns {string} Formatted percentage
 */
export function formatPercentage(value, decimals = 2) {
  if (value === null || value === undefined) return '0%';
  return `${parseFloat(value).toFixed(decimals)}%`;
}

/**
 * Format a date to readable string
 * @param {string|Date} date - Date to format
 * @param {boolean} includeTime - Include time in output
 * @returns {string} Formatted date
 */
export function formatDate(date, includeTime = false) {
  if (!date) return 'N/A';
  
  const d = new Date(date);
  
  if (isNaN(d.getTime())) return 'Invalid Date';
  
  const options = {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  };
  
  if (includeTime) {
    options.hour = '2-digit';
    options.minute = '2-digit';
  }
  
  return d.toLocaleDateString('en-US', options);
}

/**
 * Format a date and time to readable string
 * @param {string|Date} date - Date to format
 * @returns {string} Formatted date and time
 */
export function formatDateTime(date) {
  if (!date) return 'N/A';
  
  const d = new Date(date);
  
  if (isNaN(d.getTime())) return 'Invalid Date';
  
  const options = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  };
  
  return d.toLocaleDateString('en-US', options);
}

/**
 * Format a relative time (e.g., "2 days ago")
 * @param {string|Date} date - Date to format
 * @returns {string} Relative time string
 */
export function formatRelativeTime(date) {
  if (!date) return 'Never';
  
  const d = new Date(date);
  if (isNaN(d.getTime())) return 'Invalid Date';
  
  const now = new Date();
  const seconds = Math.floor((now - d) / 1000);
  
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)} days ago`;
  if (seconds < 2592000) return `${Math.floor(seconds / 604800)} weeks ago`;
  if (seconds < 31536000) return `${Math.floor(seconds / 2592000)} months ago`;
  return `${Math.floor(seconds / 31536000)} years ago`;
}

/**
 * Get status color class based on value
 * @param {string} status - Status value
 * @returns {string} Tailwind color class
 */
export function getStatusColor(status) {
  const colors = {
    active: 'bg-green-100 text-green-800',
    inactive: 'bg-gray-100 text-gray-800',
    published: 'bg-blue-100 text-blue-800',
    unpublished: 'bg-yellow-100 text-yellow-800',
    success: 'bg-green-100 text-green-800',
    failed: 'bg-red-100 text-red-800',
    pending: 'bg-yellow-100 text-yellow-800'
  };
  
  return colors[status?.toLowerCase()] || 'bg-gray-100 text-gray-800';
}

/**
 * Get rate color based on performance
 * @param {number} rate - Rate percentage
 * @param {string} type - Rate type (read, click, unsubscribe)
 * @returns {string} Tailwind color class
 */
export function getRateColor(rate, type = 'read') {
  const value = parseFloat(rate);
  
  if (type === 'unsubscribe') {
    // Lower is better for unsubscribe rate
    if (value < 0.5) return 'text-green-600';
    if (value < 1.0) return 'text-yellow-600';
    return 'text-red-600';
  }
  
  // Higher is better for read/click rates
  if (value >= 30) return 'text-green-600';
  if (value >= 15) return 'text-yellow-600';
  return 'text-red-600';
}

/**
 * Truncate text to specified length
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} Truncated text
 */
export function truncateText(text, maxLength = 50) {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

/**
 * Calculate email performance score
 * @param {Object} email - Email object with rates
 * @returns {number} Score from 0-100
 */
export function calculateEmailScore(email) {
  const readRate = parseFloat(email.readRate) || 0;
  const clickRate = parseFloat(email.clickRate) || 0;
  const unsubscribeRate = parseFloat(email.unsubscribeRate) || 0;
  
  // Weighted score calculation
  const score = (
    (readRate * 0.4) +           // 40% weight on open rate
    (clickRate * 0.5) +          // 50% weight on click rate
    ((2 - unsubscribeRate) * 5)  // 10% weight on low unsubscribe rate
  );
  
  return Math.min(100, Math.max(0, score));
}

/**
 * Get email performance label
 * @param {number} score - Email score
 * @returns {Object} { label, color }
 */
export function getEmailPerformanceLabel(score) {
  if (score >= 70) {
    return { label: 'Excellent', color: 'text-green-600' };
  } else if (score >= 50) {
    return { label: 'Good', color: 'text-blue-600' };
  } else if (score >= 30) {
    return { label: 'Fair', color: 'text-yellow-600' };
  } else {
    return { label: 'Poor', color: 'text-red-600' };
  }
}

/**
 * Validate email address
 * @param {string} email - Email to validate
 * @returns {boolean} Is valid
 */
export function isValidEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

/**
 * Validate URL
 * @param {string} url - URL to validate
 * @returns {boolean} Is valid
 */
export function isValidUrl(url) {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Extract domain from email
 * @param {string} email - Email address
 * @returns {string} Domain
 */
export function extractDomain(email) {
  if (!email) return '';
  const parts = email.split('@');
  return parts.length > 1 ? parts[1] : '';
}

/**
 * Group contacts by domain
 * @param {Array} contacts - Array of contact objects
 * @returns {Object} Grouped contacts
 */
export function groupContactsByDomain(contacts) {
  return contacts.reduce((acc, contact) => {
    const domain = extractDomain(contact.email);
    if (!acc[domain]) {
      acc[domain] = [];
    }
    acc[domain].push(contact);
    return acc;
  }, {});
}

/**
 * Sort array by field
 * @param {Array} array - Array to sort
 * @param {string} field - Field to sort by
 * @param {string} order - 'asc' or 'desc'
 * @returns {Array} Sorted array
 */
export function sortBy(array, field, order = 'asc') {
  return [...array].sort((a, b) => {
    const aVal = a[field];
    const bVal = b[field];
    
    if (aVal === bVal) return 0;
    
    if (order === 'asc') {
      return aVal > bVal ? 1 : -1;
    } else {
      return aVal < bVal ? 1 : -1;
    }
  });
}

/**
 * Filter array by search term
 * @param {Array} array - Array to filter
 * @param {string} searchTerm - Search term
 * @param {Array} fields - Fields to search in
 * @returns {Array} Filtered array
 */
export function filterBySearch(array, searchTerm, fields = []) {
  if (!searchTerm) return array;
  
  const term = searchTerm.toLowerCase();
  
  return array.filter(item => {
    return fields.some(field => {
      const value = item[field];
      return value && String(value).toLowerCase().includes(term);
    });
  });
}
