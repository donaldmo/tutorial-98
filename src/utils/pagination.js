/**
 * pagination.js
 *
 * Group 4 – Task 4.2: Shared pagination helpers for list endpoints.
 *
 * All list endpoints accept:
 *   ?page=<1-based integer>   default: 1
 *   ?limit=<integer>          default: 50, max: 200
 *
 * Response envelope shape:
 * {
 *   "data": [ ... ],
 *   "pagination": {
 *     "page": 1,
 *     "limit": 50,
 *     "total": 243,
 *     "total_pages": 5
 *   }
 * }
 */

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/**
 * Parse `page` and `limit` from an Express query object.
 *
 * @param {object} query – req.query
 * @returns {{ page: number, limit: number, skip: number }}
 */
export const parsePagination = (query = {}) => {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const rawLimit = parseInt(query.limit, 10) || DEFAULT_LIMIT;
  const limit = Math.min(MAX_LIMIT, Math.max(1, rawLimit));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
};

/**
 * Build the `pagination` meta block to include in responses.
 *
 * @param {number} total  – total document count matching the query
 * @param {number} page   – current page (1-based)
 * @param {number} limit  – page size
 * @returns {{ page: number, limit: number, total: number, total_pages: number }}
 */
export const buildPaginationMeta = (total, page, limit) => ({
  page,
  limit,
  total,
  total_pages: Math.ceil(total / limit) || 1,
});
