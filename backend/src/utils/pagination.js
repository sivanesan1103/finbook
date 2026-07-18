export const getPagination = (query) => {
  const page = Math.max(1, Number(query.page || 1));
  const limit = Math.min(100, Math.max(1, Number(query.limit || 20)));
  return { page, limit, skip: (page - 1) * limit, take: limit };
};

export const paged = (rows, total, { page, limit }) => ({
  data: rows,
  meta: { page, limit, total, pages: Math.ceil(total / limit) },
});
