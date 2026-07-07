/** Central error handler — tasks.md 9.4. Every route funnels errors here. */
// eslint-disable-next-line no-unused-vars
module.exports = (err, req, res, next) => {
  const status = err.status || 500;
  const message = status >= 500 ? 'Internal server error.' : err.message;
  if (status >= 500) {
    console.error(`[error] ${req.method} ${req.originalUrl}:`, err);
  }
  res.status(status).json({ error: message });
};
