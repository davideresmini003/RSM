// Minimal logger — only emits in development to keep production console clean.
const isDev = process.env.NODE_ENV !== "production";

export const log = {
  warn: (...args) => { if (isDev) console.warn(...args); },
  error: (...args) => { if (isDev) console.error(...args); },
};
