import { describe, it, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdir, rm, writeFile } from 'fs/promises';
import {
  DEFAULT_CONFIG,
  loadConfigFile,
  mergeConfig,
  isITerm2,
  notify,
  ensureGlobalConfig,
  loadConfig,
  getGlobalConfigDir,
  type NotificationConfig,
} from './internals';
import { NotificationPlugin } from './index';

describe('DEFAULT_CONFIG', () => {
  it('should have all required properties with correct structure', () => {
    // Test structure and types, not exact string values
    expect(typeof DEFAULT_CONFIG.enabled).toBe('boolean');
    expect(typeof DEFAULT_CONFIG.itermIntegrationEnabled).toBe('boolean');

    // Verify all event types exist with required properties
    const eventTypes = ['session.idle', 'permission.updated', 'session.error'] as const;
    for (const eventType of eventTypes) {
      const eventConfig = DEFAULT_CONFIG.events[eventType];
      expect(typeof eventConfig.enabled).toBe('boolean');
      expect(typeof eventConfig.message).toBe('string');
      expect(eventConfig.message.length).toBeGreaterThan(0);
    }
  });
});

describe('mergeConfig', () => {
  it('should return defaults when user config is empty', () => {
    const result = mergeConfig(DEFAULT_CONFIG, {});
    expect(result).toEqual(DEFAULT_CONFIG);
  });

  it('should override enabled at root level', () => {
    const result = mergeConfig(DEFAULT_CONFIG, { enabled: false });
    expect(result.enabled).toBe(false);
    expect(result.itermIntegrationEnabled).toBe(true);
  });

  it('should override itermIntegrationEnabled', () => {
    const result = mergeConfig(DEFAULT_CONFIG, { itermIntegrationEnabled: false });
    expect(result.itermIntegrationEnabled).toBe(false);
    expect(result.enabled).toBe(true);
  });

  it('should override specific event config', () => {
    const result = mergeConfig(DEFAULT_CONFIG, {
      events: {
        'session.idle': {
          enabled: false,
          message: 'Custom message',
        },
      },
    } as Partial<NotificationConfig>);

    expect(result.events['session.idle']).toEqual({
      enabled: false,
      message: 'Custom message',
    });
    // Other events should remain default
    expect(result.events['permission.updated']).toEqual(
      DEFAULT_CONFIG.events['permission.updated']
    );
    expect(result.events['session.error']).toEqual(DEFAULT_CONFIG.events['session.error']);
  });

  it('should partially override event config', () => {
    const result = mergeConfig(DEFAULT_CONFIG, {
      events: {
        'session.idle': {
          message: 'Only message changed',
        },
      },
    } as Partial<NotificationConfig>);

    expect(result.events['session.idle']).toEqual({
      enabled: true, // kept from defaults
      message: 'Only message changed',
    });
  });

  it('should merge multiple overrides', () => {
    const result = mergeConfig(DEFAULT_CONFIG, {
      enabled: false,
      itermIntegrationEnabled: false,
      events: {
        'session.error': {
          enabled: false,
        },
      },
    } as Partial<NotificationConfig>);

    expect(result.enabled).toBe(false);
    expect(result.itermIntegrationEnabled).toBe(false);
    expect(result.events['session.error'].enabled).toBe(false);
    expect(result.events['session.error'].message).toBe('Error occurred'); // kept from defaults
  });
});

describe('isITerm2', () => {
  const originalEnv = process.env.TERM_PROGRAM;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.TERM_PROGRAM;
    } else {
      process.env.TERM_PROGRAM = originalEnv;
    }
  });

  it('should return true when TERM_PROGRAM is iTerm.app', () => {
    process.env.TERM_PROGRAM = 'iTerm.app';
    expect(isITerm2()).toBe(true);
  });

  it('should return false when TERM_PROGRAM is something else', () => {
    process.env.TERM_PROGRAM = 'Apple_Terminal';
    expect(isITerm2()).toBe(false);
  });

  it('should return false when TERM_PROGRAM is undefined', () => {
    delete process.env.TERM_PROGRAM;
    expect(isITerm2()).toBe(false);
  });
});

describe('notify', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let writeSpy: any;
  const originalEnv = process.env.TERM_PROGRAM;

  beforeEach(() => {
    writeSpy = spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    writeSpy.mockRestore();
    if (originalEnv === undefined) {
      delete process.env.TERM_PROGRAM;
    } else {
      process.env.TERM_PROGRAM = originalEnv;
    }
  });

  it('should send iTerm2 escape sequence when in iTerm2 and integration enabled', () => {
    process.env.TERM_PROGRAM = 'iTerm.app';
    notify({ title: 'Test', message: 'Hello', itermIntegrationEnabled: true });

    expect(writeSpy).toHaveBeenCalledWith('\x1b]9;Test - Hello\x07');
  });

  it('should send only bell when in iTerm2 but integration disabled', () => {
    process.env.TERM_PROGRAM = 'iTerm.app';
    notify({ title: 'Test', message: 'Hello', itermIntegrationEnabled: false });

    expect(writeSpy).toHaveBeenCalledWith('\x07');
  });

  it('should send only bell when not in iTerm2', () => {
    process.env.TERM_PROGRAM = 'Apple_Terminal';
    notify({ title: 'Test', message: 'Hello', itermIntegrationEnabled: true });

    expect(writeSpy).toHaveBeenCalledWith('\x07');
  });
});

describe('loadConfigFile', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `notification-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('should return undefined for non-existent file', async () => {
    const result = await loadConfigFile(join(testDir, 'nonexistent.json'));
    expect(result).toBeUndefined();
  });

  it('should load valid JSON config', async () => {
    const configPath = join(testDir, 'config.json');
    await writeFile(configPath, JSON.stringify({ enabled: false }));

    const result = await loadConfigFile(configPath);
    expect(result).toEqual({ enabled: false });
  });

  it('should return undefined for invalid JSON', async () => {
    const configPath = join(testDir, 'invalid.json');
    await writeFile(configPath, 'not valid json');

    const result = await loadConfigFile(configPath);
    expect(result).toBeUndefined();
  });
});

describe('getGlobalConfigDir', () => {
  it('should return ~/.config/opencode path', () => {
    const result = getGlobalConfigDir();
    expect(result).toContain('.config/opencode');
    expect(result.startsWith('/')).toBe(true);
  });
});

describe('ensureGlobalConfig', () => {
  // Note: ensureGlobalConfig uses homedir() directly, so we can only test
  // that it doesn't throw. The actual file creation is tested via integration.
  it('should not throw when called', async () => {
    // Should not throw - it will either create the config or find it exists
    await ensureGlobalConfig();
  });
});

describe('loadConfig', () => {
  let baseDir: string;
  let projectDir: string;

  beforeEach(async () => {
    baseDir = join(tmpdir(), `notification-test-${Date.now()}`);
    projectDir = join(baseDir, 'project');
    await mkdir(join(projectDir, '.opencode'), { recursive: true });
  });

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  it('should return defaults when no project config exists', async () => {
    // Note: global config at ~/.config/opencode may or may not exist
    // This test verifies project config loading
    const result = await loadConfig({ directory: projectDir });
    // Should have all required properties from defaults
    expect(typeof result.enabled).toBe('boolean');
    expect(typeof result.itermIntegrationEnabled).toBe('boolean');
    expect(result.events['session.idle']).toBeDefined();
  });

  it('should load and merge project config', async () => {
    await writeFile(
      join(projectDir, '.opencode', 'notification.json'),
      JSON.stringify({ enabled: false })
    );

    const result = await loadConfig({ directory: projectDir });
    expect(result.enabled).toBe(false);
    // itermIntegrationEnabled comes from defaults or global config, just verify it's a boolean
    expect(typeof result.itermIntegrationEnabled).toBe('boolean');
  });

  it('should give project config precedence', async () => {
    // Project config should override any global config
    await writeFile(
      join(projectDir, '.opencode', 'notification.json'),
      JSON.stringify({ enabled: true, itermIntegrationEnabled: false })
    );

    const result = await loadConfig({ directory: projectDir });
    expect(result.enabled).toBe(true);
    expect(result.itermIntegrationEnabled).toBe(false);
  });
});

describe('NotificationPlugin', () => {
  let testDir: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let writeSpy: any;
  const originalEnv = process.env.TERM_PROGRAM;

  beforeEach(async () => {
    testDir = join(tmpdir(), `notification-test-${Date.now()}`);
    await mkdir(join(testDir, '.opencode'), { recursive: true });
    // Create default config with iTerm integration enabled for tests
    await writeFile(
      join(testDir, '.opencode', 'notification.json'),
      JSON.stringify({ itermIntegrationEnabled: true })
    );
    writeSpy = spyOn(process.stdout, 'write').mockImplementation(() => true);
    // Set iTerm2 environment for tests that check notification content
    process.env.TERM_PROGRAM = 'iTerm.app';
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
    writeSpy.mockRestore();
    if (originalEnv === undefined) {
      delete process.env.TERM_PROGRAM;
    } else {
      process.env.TERM_PROGRAM = originalEnv;
    }
  });

  function createMockClient(options: { sessionTitle?: string; configDir?: string } = {}) {
    return {
      path: {
        get: mock().mockResolvedValue({
          data: { config: options.configDir ?? join(testDir, 'global-config') },
        }),
      },
      session: {
        get: mock().mockResolvedValue({
          data: { title: options.sessionTitle ?? 'Test Session' },
        }),
      },
    };
  }

  it('should initialize and return event handler', async () => {
    const mockClient = createMockClient();
    const plugin = await NotificationPlugin({
      client: mockClient as never,
      directory: testDir,
      worktree: testDir,
      project: {} as never,
      $: {} as never,
      serverUrl: new URL('http://localhost:3000'),
    });

    expect(plugin.event).toBeDefined();
    expect(typeof plugin.event).toBe('function');
  });

  it('should handle session.idle event with session title', async () => {
    const mockClient = createMockClient({ sessionTitle: 'My Session' });
    const plugin = await NotificationPlugin({
      client: mockClient as never,
      directory: testDir,
      worktree: testDir,
      project: {} as never,
      $: {} as never,
      serverUrl: new URL('http://localhost:3000'),
    });

    await plugin.event!({
      event: {
        type: 'session.idle',
        properties: { sessionID: 'test-session-id' },
      } as never,
    });

    expect(writeSpy).toHaveBeenCalled();
    const callArg = writeSpy.mock.calls[0][0] as string;
    expect(callArg).toContain('My Session');
  });

  it('should handle permission.updated event with permission title', async () => {
    const mockClient = createMockClient();
    const plugin = await NotificationPlugin({
      client: mockClient as never,
      directory: testDir,
      worktree: testDir,
      project: {} as never,
      $: {} as never,
      serverUrl: new URL('http://localhost:3000'),
    });

    await plugin.event!({
      event: {
        type: 'permission.updated',
        properties: { title: 'File Write' },
      } as never,
    });

    expect(writeSpy).toHaveBeenCalled();
    const callArg = writeSpy.mock.calls[0][0] as string;
    expect(callArg).toContain('File Write');
  });

  it('should handle session.error event', async () => {
    const mockClient = createMockClient();
    const plugin = await NotificationPlugin({
      client: mockClient as never,
      directory: testDir,
      worktree: testDir,
      project: {} as never,
      $: {} as never,
      serverUrl: new URL('http://localhost:3000'),
    });

    await plugin.event!({
      event: {
        type: 'session.error',
        properties: {},
      } as never,
    });

    expect(writeSpy).toHaveBeenCalled();
    const callArg = writeSpy.mock.calls[0][0] as string;
    expect(callArg).toContain('Error occurred');
  });

  it('should not notify when plugin is disabled', async () => {
    await writeFile(
      join(testDir, '.opencode', 'notification.json'),
      JSON.stringify({ enabled: false })
    );

    const mockClient = createMockClient();
    const plugin = await NotificationPlugin({
      client: mockClient as never,
      directory: testDir,
      worktree: testDir,
      project: {} as never,
      $: {} as never,
      serverUrl: new URL('http://localhost:3000'),
    });

    await plugin.event!({
      event: {
        type: 'session.idle',
        properties: { sessionID: 'test-session-id' },
      } as never,
    });

    expect(writeSpy).not.toHaveBeenCalled();
  });

  it('should not notify when specific event is disabled', async () => {
    await writeFile(
      join(testDir, '.opencode', 'notification.json'),
      JSON.stringify({
        events: {
          'session.idle': { enabled: false },
        },
      })
    );

    const mockClient = createMockClient();
    const plugin = await NotificationPlugin({
      client: mockClient as never,
      directory: testDir,
      worktree: testDir,
      project: {} as never,
      $: {} as never,
      serverUrl: new URL('http://localhost:3000'),
    });

    await plugin.event!({
      event: {
        type: 'session.idle',
        properties: { sessionID: 'test-session-id' },
      } as never,
    });

    expect(writeSpy).not.toHaveBeenCalled();
  });

  it('should use fallback session title when fetch fails', async () => {
    const mockClient = {
      path: {
        get: mock().mockResolvedValue({ data: { config: join(testDir, 'global-config') } }),
      },
      session: {
        get: mock().mockRejectedValue(new Error('Network error')),
      },
    };

    const plugin = await NotificationPlugin({
      client: mockClient as never,
      directory: testDir,
      worktree: testDir,
      project: {} as never,
      $: {} as never,
      serverUrl: new URL('http://localhost:3000'),
    });

    await plugin.event!({
      event: {
        type: 'session.idle',
        properties: { sessionID: 'test-session-id' },
      } as never,
    });

    expect(writeSpy).toHaveBeenCalled();
    const callArg = writeSpy.mock.calls[0][0] as string;
    expect(callArg).toContain('Session');
  });

  it('should use "Unknown" for permission.updated when title is missing', async () => {
    const mockClient = createMockClient();
    const plugin = await NotificationPlugin({
      client: mockClient as never,
      directory: testDir,
      worktree: testDir,
      project: {} as never,
      $: {} as never,
      serverUrl: new URL('http://localhost:3000'),
    });

    await plugin.event!({
      event: {
        type: 'permission.updated',
        properties: {},
      } as never,
    });

    expect(writeSpy).toHaveBeenCalled();
    const callArg = writeSpy.mock.calls[0][0] as string;
    expect(callArg).toContain('Unknown');
  });
});
