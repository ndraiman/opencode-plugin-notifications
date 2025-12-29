import { describe, it, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdir, rm, writeFile, readFile } from 'fs/promises';
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
  it('should return config path from client', async () => {
    const mockClient = {
      path: {
        get: mock().mockResolvedValue({ data: { config: '/home/user/.config/opencode' } }),
      },
    };

    const result = await getGlobalConfigDir(mockClient as never);
    expect(result).toBe('/home/user/.config/opencode');
  });

  it('should return empty string when config path is not available', async () => {
    // Test both undefined config and undefined data
    const testCases = [{ data: { config: undefined } }, { data: undefined }];

    for (const response of testCases) {
      const mockClient = {
        path: {
          get: mock().mockResolvedValue(response),
        },
      };

      const result = await getGlobalConfigDir(mockClient as never);
      expect(result).toBe('');
    }
  });
});

describe('ensureGlobalConfig', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `notification-test-${Date.now()}`);
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('should create config file with defaults if not exists', async () => {
    const mockClient = {
      path: {
        get: mock().mockResolvedValue({ data: { config: testDir } }),
      },
    };

    await ensureGlobalConfig(mockClient as never);

    const configPath = join(testDir, 'notification.json');
    const content = await readFile(configPath, 'utf-8');
    expect(JSON.parse(content)).toEqual(DEFAULT_CONFIG);
  });

  it('should not overwrite existing config', async () => {
    await mkdir(testDir, { recursive: true });
    const configPath = join(testDir, 'notification.json');
    const existingConfig = { enabled: false };
    await writeFile(configPath, JSON.stringify(existingConfig));

    const mockClient = {
      path: {
        get: mock().mockResolvedValue({ data: { config: testDir } }),
      },
    };

    await ensureGlobalConfig(mockClient as never);

    const content = await readFile(configPath, 'utf-8');
    expect(JSON.parse(content)).toEqual(existingConfig);
  });

  it('should handle empty config path gracefully', async () => {
    const mockClient = {
      path: {
        get: mock().mockResolvedValue({ data: { config: '' } }),
      },
    };

    // Should not throw
    await ensureGlobalConfig(mockClient as never);
  });
});

describe('loadConfig', () => {
  let baseDir: string;
  let globalDir: string;
  let projectDir: string;

  beforeEach(async () => {
    baseDir = join(tmpdir(), `notification-test-${Date.now()}`);
    globalDir = join(baseDir, 'global');
    projectDir = join(baseDir, 'project');
    await mkdir(join(projectDir, '.opencode'), { recursive: true });
    await mkdir(globalDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  it('should return defaults when no config files exist', async () => {
    const mockClient = {
      path: {
        get: mock().mockResolvedValue({ data: { config: globalDir } }),
      },
    };

    const result = await loadConfig({ client: mockClient as never, directory: projectDir });
    expect(result).toEqual(DEFAULT_CONFIG);
  });

  it('should load and merge global config', async () => {
    await writeFile(
      join(globalDir, 'notification.json'),
      JSON.stringify({ itermIntegrationEnabled: false })
    );

    const mockClient = {
      path: {
        get: mock().mockResolvedValue({ data: { config: globalDir } }),
      },
    };

    const result = await loadConfig({ client: mockClient as never, directory: projectDir });
    expect(result.itermIntegrationEnabled).toBe(false);
    expect(result.enabled).toBe(true); // from defaults
  });

  it('should load and merge project config', async () => {
    await writeFile(
      join(projectDir, '.opencode', 'notification.json'),
      JSON.stringify({ enabled: false })
    );

    const mockClient = {
      path: {
        get: mock().mockResolvedValue({ data: { config: globalDir } }),
      },
    };

    const result = await loadConfig({ client: mockClient as never, directory: projectDir });
    expect(result.enabled).toBe(false);
    expect(result.itermIntegrationEnabled).toBe(true); // from defaults
  });

  it('should give project config precedence over global', async () => {
    await writeFile(
      join(globalDir, 'notification.json'),
      JSON.stringify({ itermIntegrationEnabled: false, enabled: false })
    );
    await writeFile(
      join(projectDir, '.opencode', 'notification.json'),
      JSON.stringify({ enabled: true })
    );

    const mockClient = {
      path: {
        get: mock().mockResolvedValue({ data: { config: globalDir } }),
      },
    };

    const result = await loadConfig({ client: mockClient as never, directory: projectDir });
    expect(result.enabled).toBe(true); // from project (overrides global)
    expect(result.itermIntegrationEnabled).toBe(false); // from global
  });
});

describe('NotificationPlugin', () => {
  let testDir: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let writeSpy: any;

  beforeEach(async () => {
    testDir = join(tmpdir(), `notification-test-${Date.now()}`);
    await mkdir(join(testDir, '.opencode'), { recursive: true });
    writeSpy = spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
    writeSpy.mockRestore();
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
