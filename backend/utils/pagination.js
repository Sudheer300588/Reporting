/**
 * Pagination Utilities
 * Provides consistent pagination across all list endpoints
 */

/**
 * Calculate skip and take values for Prisma
 */
export const paginate = (page = 1, limit = 20) => {
  const skip = (page - 1) * limit;
  return { skip, take: limit };
};

/**
 * Create standardized pagination response
 */
export const paginationResponse = (data, total, page, limit) => {
  const totalPages = Math.ceil(total / limit);
  
  return {
    success: true,
    data,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
      nextPage: page < totalPages ? page + 1 : null,
      prevPage: page > 1 ? page - 1 : null
    }
  };
};

/**
 * Build Prisma orderBy from sort parameters
 */
export const buildOrderBy = (sortBy, sortOrder = 'desc') => {
  if (!sortBy) return { createdAt: 'desc' };
  
  return {
    [sortBy]: sortOrder.toLowerCase() === 'asc' ? 'asc' : 'desc'
  };
};

/**
 * Build Prisma where clause for search
 */
export const buildSearchWhere = (search, searchFields) => {
  if (!search || !searchFields || searchFields.length === 0) {
    return {};
  }

  return {
    OR: searchFields.map(field => ({
      [field]: {
        contains: search,
        mode: 'insensitive'
      }
    }))
  };
};

/**
 * Extract pagination params from request with defaults
 */
export const getPaginationParams = (req) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
  const search = req.query.search?.trim() || '';
  const sortBy = req.query.sortBy || 'createdAt';
  const sortOrder = req.query.sortOrder || 'desc';

  return { page, limit, search, sortBy, sortOrder };
};
