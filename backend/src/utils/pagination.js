/**
 * ═══════════════════════════════════════════════════════════════
 * PAGINATION HELPER
 * Unified pagination for all list endpoints.
 * ═══════════════════════════════════════════════════════════════
 */

/**
 * Paginates a Mongoose query with sorting and returns a standardised response.
 *
 * @param {mongoose.Model} Model — Mongoose model
 * @param {object} filter — MongoDB filter object
 * @param {object} options
 * @param {number} [options.page=1]
 * @param {number} [options.limit=20]
 * @param {string|object} [options.sort='-createdAt'] — Mongoose sort spec
 * @param {string} [options.select] — Fields to select
 * @param {string|Array} [options.populate] — Populate spec
 * @returns {{ data: Array, pagination: object }}
 *
 * @example
 *   const result = await paginate(Profile, { role: 'caretaker' }, {
 *     page: req.query.page,
 *     limit: req.query.limit,
 *     sort: '-createdAt',
 *     select: 'fullName email role',
 *     populate: 'organizationId',
 *   });
 *   res.json(result);
 */
async function paginate(Model, filter = {}, options = {}) {
    const page = Math.max(1, parseInt(options.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(options.limit) || 20));
    const skip = (page - 1) * limit;
    const sort = options.sort || '-createdAt';

    let query = Model.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit);

    if (options.select) {
        query = query.select(options.select);
    }

    if (options.populate) {
        if (Array.isArray(options.populate)) {
            options.populate.forEach((p) => {
                query = query.populate(p);
            });
        } else {
            query = query.populate(options.populate);
        }
    }

    if (options.lean !== false) {
        query = query.lean();
    }

    const [data, total] = await Promise.all([
        query,
        Model.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
        data,
        pagination: {
            total,
            page,
            limit,
            totalPages,
            hasNext: page < totalPages,
            hasPrev: page > 1,
        },
    };
}

/**
 * Parses pagination params from Express req.query.
 *
 * @param {object} query — req.query
 * @returns {{ page: number, limit: number, skip: number, sort: string }}
 */
function parsePaginationParams(query) {
    const page = Math.max(1, parseInt(query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit) || 20));
    const skip = (page - 1) * limit;

    // Build sort from query params: ?sortBy=fullName&sortOrder=asc
    let sort = '-createdAt';
    if (query.sortBy) {
        const order = query.sortOrder === 'asc' ? '' : '-';
        sort = `${order}${query.sortBy}`;
    }

    return { page, limit, skip, sort };
}

/**
 * Builds a pagination response object from raw values.
 *
 * @param {number} total
 * @param {number} page
 * @param {number} limit
 * @returns {object}
 */
function buildPaginationMeta(total, page, limit) {
    const totalPages = Math.ceil(total / limit);
    return {
        total,
        page,
        limit,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
    };
}

module.exports = {
    paginate,
    parsePaginationParams,
    buildPaginationMeta,
};
