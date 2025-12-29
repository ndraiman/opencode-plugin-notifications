/**
 * Internal functions and types for the notification plugin.
 * Exported separately for testing purposes.
 */

import { mkdir } from 'fs/promises';
import { homedir } from 'os';

export interface NotificationEventConfig {
  enabled: boolean;
  message: string;
}

export interface NotificationConfig {
  enabled: boolean;
  itermIntegrationEnabled: boolean;
  events: {
    'session.idle': NotificationEventConfig;
    'permission.updated': NotificationEventConfig;
    'session.error': NotificationEventConfig;
  };
}

export const DEFAULT_CONFIG: NotificationConfig = {
  enabled: true,
  itermIntegrationEnabled: true,
  events: {
    'session.idle': {
      enabled: true,
      message: 'Session completed',
    },
    'permission.updated': {
      enabled: true,
      message: 'Permission needed',
    },
    'session.error': {
      enabled: true,
      message: 'Error occurred',
    },
  },
};

/**
 * Load config from a file path if it exists
 * Returns undefined if the file doesn't exist or is invalid
 */
export async function loadConfigFile(
  configPath: string
): Promise<Partial<NotificationConfig> | undefined> {
  try {
    const file = Bun.file(configPath);
    if (await file.exists()) {
      return (await file.json()) as Partial<NotificationConfig>;
    }
  } catch {
    // Config file doesn't exist or is invalid
  }
  return undefined;
}

/**
 * Get the global config directory path
 * Uses ~/.config/opencode as the standard location
 */
export function getGlobalConfigDir(): string {
  return `${homedir()}/.config/opencode`;
}

/**
 * Ensure the global config file exists, creating it with defaults if missing
 */
export async function ensureGlobalConfig(): Promise<void> {
  const globalConfigDir = getGlobalConfigDir();
  const globalConfigPath = `${globalConfigDir}/notification.json`;

  try {
    const file = Bun.file(globalConfigPath);
    if (await file.exists()) return;

    // Create parent directory if needed
    await mkdir(globalConfigDir, { recursive: true });

    // Write default config
    await Bun.write(globalConfigPath, JSON.stringify(DEFAULT_CONFIG, null, 2) + '\n');
  } catch {
    // Failed to create config, continue with defaults
  }
}

export interface LoadConfigOptions {
  directory: string;
}

/**
 * Load notification config with the following precedence:
 * 1. Project config: {directory}/.opencode/notification.json
 * 2. Global config: ~/.config/opencode/notification.json
 * 3. Default config
 *
 * Project config values override global config values
 */
export async function loadConfig({ directory }: LoadConfigOptions): Promise<NotificationConfig> {
  const globalConfigPath = `${getGlobalConfigDir()}/notification.json`;
  const projectConfigPath = `${directory}/.opencode/notification.json`;

  const globalConfig = globalConfigPath ? await loadConfigFile(globalConfigPath) : undefined;
  const projectConfig = await loadConfigFile(projectConfigPath);

  // Merge: defaults <- global <- project
  let config = DEFAULT_CONFIG;
  if (globalConfig) {
    config = mergeConfig(config, globalConfig);
  }
  if (projectConfig) {
    config = mergeConfig(config, projectConfig);
  }

  return config;
}

/**
 * Deep merge user config with defaults
 */
export function mergeConfig(
  defaults: NotificationConfig,
  user: Partial<NotificationConfig>
): NotificationConfig {
  return {
    enabled: user.enabled ?? defaults.enabled,
    itermIntegrationEnabled: user.itermIntegrationEnabled ?? defaults.itermIntegrationEnabled,
    events: {
      'session.idle': {
        ...defaults.events['session.idle'],
        ...user.events?.['session.idle'],
      },
      'permission.updated': {
        ...defaults.events['permission.updated'],
        ...user.events?.['permission.updated'],
      },
      'session.error': {
        ...defaults.events['session.error'],
        ...user.events?.['session.error'],
      },
    },
  };
}

/**
 * Detect if running in iTerm2
 */
export function isITerm2(): boolean {
  return process.env.TERM_PROGRAM === 'iTerm.app';
}

export interface NotifyOptions {
  title: string;
  message: string;
  itermIntegrationEnabled: boolean;
}

/**
 * Send a notification using iTerm2 escape sequence (if available) and terminal bell
 *
 * iTerm2 escape sequence format: \x1b]9;message\x07
 * This triggers a native macOS notification when iTerm2 is configured to show them.
 *
 * Terminal bell: \x07
 * This triggers the terminal's bell behavior (sound, visual flash, or notification
 * depending on terminal settings).
 */
export function notify({ title, message, itermIntegrationEnabled }: NotifyOptions): void {
  const fullMessage = `${title} - ${message}`;

  if (itermIntegrationEnabled && isITerm2()) {
    // iTerm2 escape sequence for notifications
    // The \x07 at the end also triggers the bell
    process.stdout.write(`\x1b]9;${fullMessage}\x07`);
  } else {
    // Just the bell for other terminals
    process.stdout.write('\x07');
  }
}
