# OpenCode Plugins Agent Notes

This repository is a pnpm monorepo for OpenCode plugins.

## Workspace Layout

- Put plugins in `packages/plugins/*`.
- Each plugin package owns its source, package metadata, README, tests, and plugin-specific notes.
- Keep root files focused on workspace orchestration and shared conventions.

## Package Manager

- Use `pnpm` for workspace dependency management and recursive scripts.
- Do not add package-local lockfiles such as `bun.lock`.
- Existing plugin scripts may invoke `bun` for tests or source checks when that is the simplest OpenCode-compatible workflow.

## OpenCode Plugin Conventions

- Server plugin modules should export a default object shaped as `{ id, server }` and type it with `PluginModule` from `@opencode-ai/plugin`.
- TUI plugin modules should export a default object shaped as `{ id, tui }` and type it with `TuiPluginModule` from `@opencode-ai/plugin/tui`.
- Do not export both `server` and `tui` from the same module.
- Keep package `exports` explicit and pointed at the source entrypoint used by OpenCode.
- Use package peer dependencies for OpenCode/TUI runtime packages.
- Keep source entrypoints as TypeScript/TSX unless a package explicitly introduces a build/publish flow.

## Server Plugin Rules

- Type server plugins with `Plugin` / `PluginModule`.
- Server hooks should follow OpenCode's input/output mutation model.
- Use structured logging through `client.app.log()` where useful.

## TUI Plugin Rules

- Type TUI plugins with `TuiPlugin` / `TuiPluginModule`.
- Prefer `api.keymap.registerLayer` for commands and keybindings.
- Use `api.slots.register` for slot rendering.
- Register disposers with `api.lifecycle.onDispose` when subscriptions, timers, or resources are created.

## bash-guard Specific Rules

`packages/plugins/oc-bash-guard` has stricter safety behavior documented in its package `AGENTS.md`. Preserve those rules when changing that package, especially:

- Use `permission.asked` events plus the permission reply API for built-in bash guard behavior.
- Keep `permission.ask` only as a compatibility hook.
- Do not use `context.ask` for built-in bash permissions.
- Unknown bash command text must ask, not allow.
- Non-bash permissions must be left unchanged.
