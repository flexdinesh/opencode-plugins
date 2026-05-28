# opencode-plugins

A pnpm monorepo for OpenCode plugins.

## Layout

```txt
packages/
  plugins/
    oc-bash-guard/  # server plugin
    oc-tps/         # TUI plugin
    oc-timer/       # TUI plugin
```

## Plugins

| Package | Type | Description |
| --- | --- | --- |
| `oc-bash-guard` | Server | Prompts before risky bash commands and allows safe commands through. |
| `oc-tps` | TUI | Displays live TPS, average TPS, and average TTFT in the session prompt. |
| `oc-timer` | TUI | Shows active elapsed session time in the session prompt. |

## Development

Install workspace dependencies:

```sh
pnpm install
```

Run all available package tests:

```sh
pnpm test
```

Run all available package checks:

```sh
pnpm check
```

Run a command for one package:

```sh
pnpm --filter oc-bash-guard test
pnpm --filter oc-tps check
pnpm --filter oc-timer check
```

## Adding a plugin

1. Create a package under `packages/plugins/<plugin-name>`.
2. Add a `package.json` with explicit OpenCode exports.
3. Keep server and TUI plugins in separate modules/packages.
4. For server plugins, default-export `{ id, server }` typed with `PluginModule` from `@opencode-ai/plugin`.
5. For TUI plugins, default-export `{ id, tui }` typed with `TuiPluginModule` from `@opencode-ai/plugin/tui`.
6. Add plugin-specific docs and tests/checks.

## Local OpenCode usage

Install local plugins by adding a `file:` dependency to `~/.config/opencode/package.json`:

```json
{
  "dependencies": {
    "oc-bash-guard": "file:../../workspace/opencode-plugins/packages/plugins/oc-bash-guard"
  }
}
```

Then install from the OpenCode config directory:

```sh
cd ~/.config/opencode
pnpm install
```

Server plugins go in `opencode.json` or `opencode.jsonc`:

```json
{
  "plugin": ["./node_modules/oc-bash-guard"]
}
```

TUI plugins go in `tui.json` and use the installed package export:

```json
{
  "plugin": ["oc-tps/tui", "oc-timer/tui"]
}
```

Restart OpenCode after changing plugin files, config, or dependencies.
