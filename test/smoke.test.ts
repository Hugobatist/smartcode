import { describe, it, expect } from 'vitest';

describe('smoke tests', () => {
  it('imports diagram types without errors', async () => {
    const types = await import('../src/diagram/types.js');
    // Type-level smoke test: verify the module exports exist
    expect(types).toBeDefined();
  });

  it('imports logger and log.info is a function', async () => {
    const { log } = await import('../src/utils/logger.js');
    expect(log.info).toBeTypeOf('function');
    expect(log.warn).toBeTypeOf('function');
    expect(log.error).toBeTypeOf('function');
    expect(log.debug).toBeTypeOf('function');
  });

  it('resolveProjectPath throws on path traversal', async () => {
    const { resolveProjectPath } = await import('../src/utils/paths.js');
    expect(() => resolveProjectPath('/project', '../../etc/passwd')).toThrow(
      'Path traversal detected',
    );
  });

  it('getStaticDir returns a string ending in static', async () => {
    const { getStaticDir } = await import('../src/utils/paths.js');
    const dir = getStaticDir();
    expect(typeof dir).toBe('string');
    expect(dir.endsWith('static')).toBe(true);
  });
});
