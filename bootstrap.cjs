// CJS entry for pkg to load the ESM app.
const path = require('path');
const { URL } = require('url');

const entryPath = path.resolve(__dirname, 'server.js').replace(/\\/g, '/');
const entryUrl = new URL(`file:///${entryPath}`).href;
import(entryUrl).catch((err) => {
  console.error('Failed to start app:', err);
  process.exit(1);
});
