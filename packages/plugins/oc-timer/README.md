# oc-timer

OpenCode TUI plugin that shows active elapsed session time next to the session prompt.

## Purpose

`oc-timer` tracks how long an OpenCode session has been active. It pauses when the session becomes idle and resumes when new session activity arrives. Elapsed time is persisted per session with OpenCode plugin `kv`, so restarting OpenCode keeps the timer value.

Display example:

```text
12m 34s
```

The timer is rendered in the `session_prompt_right` slot. The time is bold and uses the current theme warning color. The trailing separator dot uses muted text color.

## Installation

Requires OpenCode `1.14.22` or newer.

Add the package TUI export to `~/.config/opencode/tui.json` after installing or linking the package:

```json
{
  "plugin": ["oc-timer/tui"]
}
```

For source-file development from this monorepo, you can also point directly at the plugin source file:

```json
{
  "plugin": ["/Users/theuser/workspace/opencode-plugins/packages/plugins/oc-timer/tui.tsx"]
}
```

Restart OpenCode after editing `tui.json`.

## Development Check

From the workspace root:

```sh
pnpm --filter oc-timer check
```

From this package directory:

```sh
bun build tui.tsx --target=bun --outfile=/tmp/oc-timer-check.js --external "solid-js" --external "@opentui/solid" --external "@opentui/solid/jsx-dev-runtime"
```
