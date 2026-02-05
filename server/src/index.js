require('dotenv').config();

const { app, db, startServer, stopServer, sessionCookieOptions } = require('./app');

const PORT = process.env.PORT || 3000;

if (require.main === module) {
  startServer(PORT, { log: true }).catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Failed to start server:', err && err.message ? err.message : err);
    process.exit(1);
  });
}

module.exports = {
  app,
  db,
  startServer,
  stopServer,
  sessionCookieOptions
};
