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
 */

import type { Plugin } from '@opencode-ai/plugin';

interface NotificationEventConfig {
  enabled: boolean;
  message: string;
}

interface NotificationConfig {
  enabled: boolean;
  events: {
    'session.idle': NotificationEventConfig;
    'permission.updated': NotificationEventConfig;
    'session.error': NotificationEventConfig;
  };
}

const DEFAULT_CONFIG: NotificationConfig = {
  enabled: true,
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
 * Load notification config from .opencode/notification.json
 * Falls back to default config if file doesn't exist or is invalid
 */
async function loadConfig(directory: string): Promise<NotificationConfig> {
  const configPath = `${directory}/.opencode/notification.json`;
  try {
    const file = Bun.file(configPath);
    if (await file.exists()) {
      const userConfig = (await file.json()) as Partial<NotificationConfig>;
      return mergeConfig(DEFAULT_CONFIG, userConfig);
    }
  } catch {
    // Config file doesn't exist or is invalid, use defaults
  }
  return DEFAULT_CONFIG;
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
function notify(title: string, message: string): void {
  const fullMessage = `${title} - ${message}`;

  if (isITerm2()) {
    // iTerm2 escape sequence for notifications
    // The \x07 at the end also triggers the bell
    process.stdout.write(`\x1b]9;${fullMessage}\x07`);
  } else {
    // Just the bell for other terminals
    process.stdout.write('\x07');
  }
}

export const NotificationPlugin: Plugin = async ({ client, directory }) => {
  const config = await loadConfig(directory);

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

          notify('OpenCode', `${eventConfig.message}: ${title}`);
          break;
        }

        case 'permission.updated': {
          const eventConfig = config.events['permission.updated'];
          if (!eventConfig?.enabled) return;

          const permissionTitle = (event.properties.title as string) ?? 'Unknown';
          notify('OpenCode', `${eventConfig.message}: ${permissionTitle}`);
          break;
        }

        case 'session.error': {
          const eventConfig = config.events['session.error'];
          if (!eventConfig?.enabled) return;

          notify('OpenCode', eventConfig.message);
          break;
        }
      }
    },
  };
};
