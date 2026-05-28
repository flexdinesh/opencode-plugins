# bash-guard Agent Notes

`bash-guard.ts` is an OpenCode server plugin that guards built-in bash permissions. Guard logic lives in `guards.ts`; config loading lives in `config.ts`.

## Rules

- Export the plugin as a default `{ id, server }` module typed with `PluginModule`.
- Use `permission.asked` events plus the permission reply API for built-in bash guard behavior.
- Keep `permission.ask` only as a compatibility hook; OpenCode 1.14.24 does not call it for built-in bash.
- Do not use `context.ask` here; it is for custom plugin tools.
- Keep changes minimal and type-safe.
- No `any`, non-null assertions, or type assertions.
- Non-bash permissions must be left unchanged.
- Unknown bash command text must ask, not allow.

## Behavior

- `blocklisted-bash` match: auto-reject.
- `destructive-bash` match: leave prompt for the user.
- `runtime-binary` match: leave prompt for the user.
- `home-path-outside-cwd` match: leave prompt for the user.
- `absolute-path-outside-cwd` match: leave prompt for the user.
- No match: auto-allow once.
- `allowAlways` is tracked per session and normalized command.
- Safe `/dev/null` redirects must not trigger destructive or path rules.
- Normal `/dev/null` references must remain guarded by absolute path rules.
- `allowedExternalDirs` config applies to bash path rules.

## Pattern Changes

- Add deny-only regexes to `BLOCKLIST_PATTERNS` in `guards.ts`.
- Add prompt-only regexes to `DESTRUCTIVE_PATTERNS` in `guards.ts`.
- Prefer precise regexes over broad command-name matches when possible.
- Verify with `bun test` after guard changes.
- Manually verify a safe command, prompted command, and blocked command after pattern edits.
