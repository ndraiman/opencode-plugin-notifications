# AGENTS.md

## Project Overview

This is the **opencode-plugin-notification** plugin for OpenCode. It sends terminal notifications when specific events occur:

- `session.idle` - Session completed
- `permission.updated` - Permission needed
- `session.error` - An error occurred

### Notification Methods

1. **iTerm2 escape sequences** (`\x1b]9;message\x07`) - Shows native macOS notifications in iTerm2
2. **Terminal bell** (`\x07`) - Works on any terminal

## Build & Test Commands

- **Build**: `bun build ./src/index.ts --outdir dist --target bun`
- **Test**: `bun test`
- **Lint**: `bunx eslint src/`
- **Type check**: `bunx tsc --noEmit`
- **Format**: `bunx prettier --write src/`

## Code Style Guidelines

### Imports & Module System

- Use ES6 `import`/`export` syntax (module: "ESNext", type: "module")
- Use `@opencode-ai/plugin` for plugin types

### Formatting (Prettier)

- **Single quotes** (`singleQuote: true`)
- **Line width**: 100 characters
- **Tab width**: 2 spaces
- **Semicolons**: enabled

### TypeScript & Naming

- **Strict mode**: enforced (`"strict": true`)
- **Interfaces**: PascalCase (e.g., `NotificationConfig`)
- **Functions**: camelCase (e.g., `loadConfig`, `notify`)
- **Explicit types**: prefer explicit type annotations

### Error Handling

- Use try/catch with empty catch blocks for optional operations (like loading config)
- Always provide fallback values

## Key Files

- `src/index.ts` - Main plugin implementation
- `examples/notification.json` - Example configuration file
- `package.json` - Dependencies and metadata

## Configuration

Users can create `.opencode/notification.json` to customize behavior. If no config exists, defaults are used (all events enabled).
