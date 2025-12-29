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

import type { Plugin } from '@opencode-ai/plugin';
import { ensureGlobalConfig, loadConfig, notify } from './internals';

export const NotificationPlugin: Plugin = async ({ client, directory }) => {
  await ensureGlobalConfig();
  const config = await loadConfig({ directory });

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
