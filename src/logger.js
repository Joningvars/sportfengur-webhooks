import { DEBUG_MODE } from './config.js';

function sanitizeArgs(args) {
  return args.map((arg) => {
    if (arg instanceof Error) {
      return arg.message || 'Error';
    }
    const type = typeof arg;
    if (type === 'string' || type === 'number' || type === 'boolean') {
      return arg;
    }
    return '[object]';
  });
}

if (!DEBUG_MODE) {
  const baseLog = console.log.bind(console);
  const baseInfo = console.info.bind(console);
  const baseWarn = console.warn.bind(console);
  const baseError = console.error.bind(console);

  console.log = (...args) => baseLog(...sanitizeArgs(args));
  console.info = (...args) => baseInfo(...sanitizeArgs(args));
  console.warn = (...args) => baseWarn(...sanitizeArgs(args));
  console.error = (...args) => baseError(...sanitizeArgs(args));
}

// Unified logging with emojis and consistent formatting
const colors = {
  reset: '\x1b[0m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
};

function timestamp() {
  return new Date().toTimeString().split(' ')[0];
}

const ENDPOINT_LOG_WINDOW_MS = 10000;
const endpointLogStats = new Map();

function logEndpointSummary(path, stat, now) {
  if (!stat.requests) return;
  const seconds = Math.max(
    1,
    Math.round((now - (stat.windowStartAt || now)) / 1000),
  );
  const suffix =
    stat.requests > 1
      ? ` (${stat.requests} req/${seconds}s)`
      : '';
  console.log(
    `${colors.cyan}[${timestamp()}] 🌐 ${path}${colors.reset} returning ${stat.latestCount} entries${suffix}`,
  );
  stat.requests = 0;
  stat.windowStartAt = now;
}

export const log = {
  webhook: {
    received: (eventName, payload) => {
      console.log(
        `${colors.cyan}[${timestamp()}] 📥 Webhook received${colors.reset} ${eventName} | event=${payload.eventId ?? 'N/A'} class=${payload.classId ?? 'N/A'} competition=${payload.competitionId ?? 'N/A'}`,
      );
    },
    processing: (eventName) => {
      console.log(
        `${colors.blue}[${timestamp()}] ⚙️  Processing${colors.reset} ${eventName}`,
      );
    },
    completed: (eventName, durationMs) => {
      console.log(
        `${colors.green}[${timestamp()}] ✅ Completed${colors.reset} ${eventName} in ${durationMs}ms`,
      );
    },
    duplicate: (key) => {
      console.log(
        `${colors.yellow}[${timestamp()}] ⏭️  Skipped duplicate${colors.reset} ${key}`,
      );
    },
    filtered: (eventId, filterId) => {
      console.log(
        `${colors.yellow}[${timestamp()}] 🚫 Filtered${colors.reset} event=${eventId} (expected ${filterId})`,
      );
    },
  },
  vmix: {
    scheduled: (eventId, classId, competitionId, forceRefresh) => {
      console.log(
        `${colors.magenta}[${timestamp()}] 📺 vMix refresh scheduled${colors.reset} event=${eventId} class=${classId} competition=${competitionId}${forceRefresh ? ' (force)' : ''}`,
      );
    },
    starting: (eventId, classId, competitionId) => {
      console.log(
        `${colors.blue}[${timestamp()}] 🔄 vMix refreshing${colors.reset} event=${eventId} class=${classId} competition=${competitionId}`,
      );
    },
    fetching: (classId, competitionId, forceRefresh) => {
      console.log(
        `${colors.blue}[${timestamp()}] 🌐 Fetching API data${colors.reset} class=${classId} competition=${competitionId}${forceRefresh ? ' (force)' : ''}`,
      );
    },
    cached: (count) => {
      console.log(
        `${colors.cyan}[${timestamp()}] 💨 Using cache${colors.reset} ${count} entries`,
      );
    },
    fetched: (riders, scores) => {
      console.log(
        `${colors.blue}[${timestamp()}] 📊 Fetched${colors.reset} ${riders} riders, ${scores} scores`,
      );
    },
    normalized: (count) => {
      console.log(
        `${colors.blue}[${timestamp()}] 🔧 Normalized${colors.reset} ${count} entries`,
      );
    },
    updated: () => {
      console.log(
        `${colors.green}[${timestamp()}] ✅ vMix state updated${colors.reset}`,
      );
    },
    skipped: () => {
      console.log(
        `${colors.yellow}[${timestamp()}] ⏭️  vMix refresh skipped${colors.reset} (already in progress)`,
      );
    },
    noContext: () => {
      console.log(
        `${colors.yellow}[${timestamp()}] ⚠️  vMix refresh skipped${colors.reset} (no competition context)`,
      );
    },
    cacheInvalidated: (key) => {
      console.log(
        `${colors.yellow}[${timestamp()}] 🗑️  Cache invalidated${colors.reset} ${key}`,
      );
    },
  },
  server: {
    endpoint: (path, count) => {
      const now = Date.now();
      const key = String(path || '');
      const stat = endpointLogStats.get(key) || {
        windowStartAt: now,
        lastFlushAt: 0,
        requests: 0,
        latestCount: 0,
      };
      stat.requests += 1;
      stat.latestCount = count;

      if (
        !stat.lastFlushAt ||
        now - stat.lastFlushAt >= ENDPOINT_LOG_WINDOW_MS
      ) {
        logEndpointSummary(key, stat, now);
        stat.lastFlushAt = now;
      }

      endpointLogStats.set(key, stat);
    },
  },
  error: (context, error) => {
    console.error(
      `${colors.red}[${timestamp()}] ❌ Error in ${context}${colors.reset}`,
      error.message,
    );
  },
};
