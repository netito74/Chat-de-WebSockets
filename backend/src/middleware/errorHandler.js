'use strict';

function errorHandler(err, req, res, _next) {
  const status = err.status || (err.name === 'ZodError' ? 400 : 500);
  const message =
    err.name === 'ZodError'
      ? err.issues.map((i) => i.message).join('; ')
      : err.message || 'Error interno del servidor';

  if (status >= 500) {
    console.error('[error]', err);
  }
  res.status(status).json({ error: message });
}

module.exports = { errorHandler };
