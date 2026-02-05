// CJS entry for pkg to load the ESM app.
const path = require('path');
const { pathToFileURL } = require('url');

const entryUrl = pathToFileURL(path.join(__dirname, 'server.js')).href;
import(entryUrl).catch((err) => {
  console.error('Failed to start app:', err);
  process.exit(1);
});
