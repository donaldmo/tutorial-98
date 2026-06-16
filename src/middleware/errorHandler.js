export const notFoundHandler = (_req, res) => {
  res.status(404).json({ detail: 'Not found' });
};

export const errorHandler = (err, _req, res, _next) => {
  // eslint-disable-next-line no-console
  console.error(err);
  const status = err.status || 500;
  res.status(status).json({ detail: err.message || 'Internal server error' });
};
