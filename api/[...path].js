const { app } = require('../server/src/app');

module.exports = (req, res) => {
  const url = req.url || '';
  if (!url.startsWith('/api/')) {
    req.url = `/api${url.startsWith('/') ? url : `/${url}`}`;
  }
  return app(req, res);
};
