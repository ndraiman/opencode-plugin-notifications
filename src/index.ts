/**
 * OpenCode Notification Plugin
 *
 * Sends terminal notifications when OpenCode events occur:
 * - session.idle: Session completed
 * - permission.updated: Permission needed
 * - session.error: An error occurred
 *
 * Supports:
 * - iTerm2 escape sequences (shows native macOS notifications)
 * - Terminal bell (works on most terminals)
 *
 * Configuration is loaded with the following precedence:
 * 1. Project config: {project}/.opencode/notification.json
 * 2. Global config: ~/.config/opencode/notification.json
 * 3. Default config
 */

import type { Plugin, PluginInput } from '@opencode-ai/plugin';
import { mkdir } from 'fs/promises';

interface NotificationEventConfig {
  enabled: boolean;
  message: string;
}

interface NotificationConfig {
  enabled: boolean;
  itermIntegrationEnabled: boolean;
  events: {
    'session.idle': NotificationEventConfig;
    'permission.updated': NotificationEventConfig;
    'session.error': NotificationEventConfig;
  };
}

const DEFAULT_CONFIG: NotificationConfig = {
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
async function loadConfigFile(
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
 * Get the global config directory path from OpenCode SDK
 */
async function getGlobalConfigDir(client: PluginInput['client']): Promise<string> {
  const pathInfo = await client.path.get();
  return pathInfo.data?.config ?? '';
}

/**
 * Ensure the global config file exists, creating it with defaults if missing
 */
async function ensureGlobalConfig(client: PluginInput['client']): Promise<void> {
  const globalConfigDir = await getGlobalConfigDir(client);
  if (!globalConfigDir) return;

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

interface LoadConfigOptions {
  client: PluginInput['client'];
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
async function loadConfig({ client, directory }: LoadConfigOptions): Promise<NotificationConfig> {
  const globalConfigDir = await getGlobalConfigDir(client);
  const globalConfigPath = globalConfigDir ? `${globalConfigDir}/notification.json` : '';
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
function mergeConfig(
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
function isITerm2(): boolean {
  return process.env.TERM_PROGRAM === 'iTerm.app';
}

interface NotifyOptions {
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
function notify({ title, message, itermIntegrationEnabled }: NotifyOptions): void {
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

// Export for testing
export {
  DEFAULT_CONFIG,
  loadConfigFile,
  mergeConfig,
  isITerm2,
  notify,
  ensureGlobalConfig,
  loadConfig,
  getGlobalConfigDir,
};
export type { NotificationConfig, NotificationEventConfig, NotifyOptions, LoadConfigOptions };

export const NotificationPlugin: Plugin = async ({ client, directory }) => {
  await ensureGlobalConfig(client);
  const config = await loadConfig({ client, directory });

  return {
    event: async ({ event }) => {
      if (!config.enabled) return;

      switch (event.type) {
        case 'session.idle': {
          const eventConfig = config.events['session.idle'];
          if (!eventConfig?.enabled) return;

          // Fetch session info to get the title
          const sessionID = event.properties.sessionID as string;
          let title = 'Session';

          try {
            const response = await client.session.get({ path: { id: sessionID } });
            if (response.data?.title) {
              title = response.data.title;
            }
          } catch {
            // Failed to fetch session, use default title
          }

          notify({
            title: 'OpenCode',
            message: `${eventConfig.message}: ${title}`,
            itermIntegrationEnabled: config.itermIntegrationEnabled,
          });
          break;
        }

        case 'permission.updated': {
          const eventConfig = config.events['permission.updated'];
          if (!eventConfig?.enabled) return;

          const permissionTitle = (event.properties.title as string) ?? 'Unknown';
          notify({
            title: 'OpenCode',
            message: `${eventConfig.message}: ${permissionTitle}`,
            itermIntegrationEnabled: config.itermIntegrationEnabled,
          });
          break;
        }

        case 'session.error': {
          const eventConfig = config.events['session.error'];
          if (!eventConfig?.enabled) return;

          notify({
            title: 'OpenCode',
            message: eventConfig.message,
            itermIntegrationEnabled: config.itermIntegrationEnabled,
          });
          break;
        }
      }
    },
  };
};
