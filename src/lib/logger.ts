/**
 * Environment-aware logger that only logs in development mode.
 * Prevents sensitive information from leaking to browser console in production.
 */
const isDev = import.meta.env.DEV;

export const logger = {
  log: (...args: unknown[]): void => {
    if (isDev) {
      console.log(...args);
    }
  },
  
  error: (...args: unknown[]): void => {
    if (isDev) {
      console.error(...args);
    }
    // In production, errors could be sent to an error monitoring service
  },
  
  warn: (...args: unknown[]): void => {
    if (isDev) {
      console.warn(...args);
    }
  },
  
  info: (...args: unknown[]): void => {
    if (isDev) {
      console.info(...args);
    }
  },
  
  debug: (...args: unknown[]): void => {
    if (isDev) {
      console.debug(...args);
    }
  }
};

export default logger;
