// Parse ?page / ?limit with sane bounds so a client cannot ask for the whole collection.
export const getPagination = (query, { defaultLimit = 10, maxLimit = 100 } = {}) => {
  const page = Math.max(1, Math.floor(Number(query.page)) || 1);
  const limit = Math.min(maxLimit, Math.max(1, Math.floor(Number(query.limit)) || defaultLimit));
  return { page, limit, skip: (page - 1) * limit };
};
