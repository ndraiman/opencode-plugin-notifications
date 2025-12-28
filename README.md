# opencode-plugin-notification

Terminal notifications for OpenCode using iTerm2 escape sequences and terminal bell.

## Features

- **iTerm2 native notifications**: Shows macOS notifications when running in iTerm2
- **Terminal bell**: Works on any terminal (behavior depends on terminal settings)
- **Configurable events**: Choose which events trigger notifications
- **Custom messages**: Customize notification messages per event

## Supported Events

| Event                | Description                                  |
| -------------------- | -------------------------------------------- |
| `session.idle`       | Session completed (includes session title)   |
| `permission.updated` | Permission needed (includes permission type) |
| `session.error`      | An error occurred                            |

## Installation

### Option 1: Add to opencode.json

Add the plugin to your OpenCode configuration:

```json
{
  "plugin": ["opencode-plugin-notification@latest"]
}
```

### Option 2: Global installation

Add to your global config at `~/.config/opencode/opencode.json`:

```json
{
  "plugin": ["opencode-plugin-notification@latest"]
}
```

## Configuration (Optional)

Create `.opencode/notification.json` in your project to customize behavior:

```json
{
  "enabled": true,
  "events": {
    "session.idle": {
      "enabled": true,
      "message": "Session completed"
    },
    "permission.updated": {
      "enabled": true,
      "message": "Permission needed"
    },
    "session.error": {
      "enabled": true,
      "message": "Error occurred"
    }
  }
}
```

### Configuration Options

| Option             | Type    | Default | Description                      |
| ------------------ | ------- | ------- | -------------------------------- |
| `enabled`          | boolean | `true`  | Enable/disable all notifications |
| `events.*.enabled` | boolean | `true`  | Enable/disable specific event    |
| `events.*.message` | string  | varies  | Custom message for the event     |

## How It Works

### iTerm2 Detection

The plugin detects iTerm2 by checking the `TERM_PROGRAM` environment variable:

```typescript
const isITerm2 = process.env.TERM_PROGRAM === 'iTerm.app';
```

### Notification Methods

1. **iTerm2 Escape Sequence** (`\x1b]9;message\x07`):
   - Triggers native macOS notifications
   - Only sent when running in iTerm2
   - Requires iTerm2 notification settings to be enabled

2. **Terminal Bell** (`\x07`):
   - Sent to all terminals
   - Behavior depends on terminal configuration (sound, flash, or nothing)

### iTerm2 Setup

To enable notifications in iTerm2:

1. Open iTerm2 Preferences
2. Go to Profiles → Terminal
3. Under "Notifications", enable "Send Notification Center alerts"
4. Optionally enable "Silence bell" to suppress the bell sound

## Development

```bash
# Install dependencies
bun install

# Build
bun run build

# Lint
bun run lint

# Format
bun run format
```

## License

MIT
