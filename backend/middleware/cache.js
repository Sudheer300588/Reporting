import NodeCache from 'node-cache';
import logger from '../utils/logger.js';

/**
 * In-memory cache for API responses
 * For production with multiple servers, consider Redis
 */
const cache = new NodeCache({
  stdTTL: 300, // 5 minutes default TTL
  checkperiod: 60, // Check for expired keys every 60 seconds
  useClones: false // Better performance, but be careful with mutations
});

/**
 * Cache Middleware
 * Caches GET request responses
 */
export const cacheMiddleware = (duration = 300) => {
  return (req, res, next) => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      return next();
    }

    // Skip cache for authenticated user-specific data
    // You can customize this logic based on your needs
    const skipCacheForRoutes = ['/api/notifications', '/api/auth/profile'];
    if (skipCacheForRoutes.some(route => req.originalUrl.includes(route))) {
      return next();
    }

    // Generate cache key (include user ID for user-specific data)
    const cacheKey = `${req.user?.id || 'public'}:${req.originalUrl}`;
    
    // Check if response is cached
    const cachedResponse = cache.get(cacheKey);
    
    if (cachedResponse) {
      logger.debug('Cache hit', { key: cacheKey });
      return res.json(cachedResponse);
    }

    // Store original res.json
    const originalJson = res.json.bind(res);

    // Override res.json to cache the response
    res.json = (body) => {
      // Only cache successful responses
      if (res.statusCode === 200 && body.success !== false) {
        cache.set(cacheKey, body, duration);
        logger.debug('Cache set', { key: cacheKey, ttl: duration });
      }
      return originalJson(body);
    };

    next();
  };
};

/**
 * Clear cache by pattern
 */
export const clearCache = (pattern) => {
  const keys = cache.keys();
  const matchingKeys = pattern 
    ? keys.filter(key => key.includes(pattern))
    : keys;
  
  matchingKeys.forEach(key => cache.del(key));
  logger.info('Cache cleared', { pattern, count: matchingKeys.length });
  
  return matchingKeys.length;
};

/**
 * Clear all cache
 */
export const clearAllCache = () => {
  cache.flushAll();
  logger.info('All cache cleared');
};

/**
 * Get cache stats
 */
export const getCacheStats = () => {
  return cache.getStats();
};

export default cache;
