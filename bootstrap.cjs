// CJS entry for pkg to load the ESM app.
import('./server.js').catch((err) => {
  console.error('Failed to start app:', err);
  process.exit(1);
});
