import pc from 'picocolors';

export const log = {
  info: (...args: unknown[]) => console.error(pc.blue('[smartb]'), ...args),
  warn: (...args: unknown[]) => console.error(pc.yellow('[smartb]'), ...args),
  error: (...args: unknown[]) => console.error(pc.red('[smartb]'), ...args),
  debug: (...args: unknown[]) => {
    if (process.env['DEBUG']) console.error(pc.dim('[smartb]'), ...args);
  },
};
