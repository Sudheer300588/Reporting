/**
 * Utility functions for Ringless Voicemail module
 */

/**
 * Format currency values
 * @param {number} value - Value to format
 * @returns {string} Formatted currency string
 */
export function formatCurrency(value) {
  if (value === null || value === undefined) return '$0.00';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2
  }).format(value);
}

/**
 * Format date to readable string
 * @param {string|Date} date - Date to format
 * @returns {string} Formatted date string
 */
export function formatDate(date) {
  if (!date) return 'N/A';
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

/**
 * Format date to ISO string for API
 * @param {string|Date} date - Date to format
 * @returns {string} ISO date string
 */
export function formatDateForAPI(date) {
  if (!date) return '';
  return new Date(date).toISOString().split('T')[0];
}

/**
 * Calculate percentage
 * @param {number} value - Numerator
 * @param {number} total - Denominator
 * @returns {string} Formatted percentage string
 */
export function calculatePercentage(value, total) {
  if (!total || total === 0) return '0%';
  return `${((value / total) * 100).toFixed(1)}%`;
}

/**
 * Parse client name from campaign name
 * Tries to intelligently extract multi-word client names (e.g., "JAE Automation")
 * @param {string} campaignName - Campaign name
 * @returns {Object} { client, cleanName }
 */
export function parseClientFromCampaign(campaignName) {
  if (!campaignName) {
    return { client: 'Unknown', cleanName: 'Untitled' };
  }
  
  if (!campaignName.includes(' ')) {
    return { client: campaignName, cleanName: campaignName };
  }
  
  const parts = campaignName.split(' ');
  
  // Try to extract up to 3 words as client name (handles cases like "JAE Automation")
  // This is a heuristic: most client names are 1-3 words
  // If campaign has more than 3 words, assume first 2-3 are client name
  let clientNameLength = 1;
  
  if (parts.length >= 3) {
    // Try 3 words first (e.g., "Long Name Inc")
    clientNameLength = 3;
  } else if (parts.length === 2) {
    // If only 2 words, both are likely the client name (e.g., "JAE Automation")
    clientNameLength = 2;
  }
  
  const client = parts.slice(0, clientNameLength).join(' ');
  const cleanName = parts.slice(clientNameLength).join(' ').trim() || campaignName;
  
  return { client, cleanName };
}

/**
 * Get unique clients from campaigns array
 * @param {Array} campaigns - Array of campaign objects
 * @returns {Array} Unique client names
 */
export function extractUniqueClients(campaigns) {
  if (!campaigns || !Array.isArray(campaigns)) return [];
  
  const clients = campaigns.map(campaign => {
    if (campaign.client) return campaign.client;
    const { client } = parseClientFromCampaign(campaign.campaignName);
    return client;
  });
  
  return ['All', ...new Set(clients.filter(c => c !== 'Unknown'))];
}

/**
 * Debounce function for search/filter inputs
 * @param {Function} func - Function to debounce
 * @param {number} delay - Delay in milliseconds
 * @returns {Function} Debounced function
 */
export function debounce(func, delay = 300) {
  let timeoutId;
  return function (...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(this, args), delay);
  };
}

/**
 * Get status badge color
 * @param {string} status - Status value
 * @returns {string} Tailwind color classes
 */
export function getStatusColor(status) {
  const statusColors = {
    completed: 'bg-green-100 text-green-800',
    delivered: 'bg-green-100 text-green-800',
    sent: 'bg-blue-100 text-blue-800',
    pending: 'bg-yellow-100 text-yellow-800',
    failed: 'bg-red-100 text-red-800',
    error: 'bg-red-100 text-red-800'
  };
  
  return statusColors[status?.toLowerCase()] || 'bg-gray-100 text-gray-800';
}

/**
 * Validate SFTP configuration
 * @param {Object} config - SFTP configuration
 * @returns {boolean} True if valid
 */
export function validateSftpConfig(config) {
  return !!(
    config &&
    config.host &&
    config.username &&
    config.password &&
    config.remotePath
  );
}

/**
 * Export data to CSV
 * @param {Array} data - Array of objects to export
 * @param {string} filename - Filename for the CSV
 */
export function exportToCSV(data, filename = 'export.csv') {
  if (!data || data.length === 0) {
    console.warn('No data to export');
    return;
  }
  
  // Get headers from first object
  const headers = Object.keys(data[0]);
  
  // Create CSV content
  const csvContent = [
    headers.join(','),
    ...data.map(row => 
      headers.map(header => {
        const value = row[header];
        // Escape values containing commas or quotes
        if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      }).join(',')
    )
  ].join('\n');
  
  // Create download link
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  
  // Cleanup
  URL.revokeObjectURL(link.href);
}
