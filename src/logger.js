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
