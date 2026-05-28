# Bash Guard Named Rules

## Summary

Refactor `oc-bash-guard` into a split OpenCode server plugin with named bash guard rules, runtime binary prompts, outside-cwd path prompts, safe `/dev/null` redirect handling, config-backed allowed external dirs, Bun tests, and docs.

## Key Implementation Changes

- Keep OpenCode built-in bash guarding through `permission.asked` events plus the permission reply API.
- Keep `permission.ask` only as a compatibility hook.
- Do not use `context.ask`.
- Split implementation into modules with clear boundaries:
  - `bash-guard.ts`: plugin entrypoint and OpenCode permission event integration.
  - `guards.ts`: named rule evaluation and command/path detection.
  - `config.ts`: config loading, expansion, and validation.
- Add named guard rules:
  - `blocklisted-bash`
  - `destructive-bash`
  - `runtime-binary`
  - `home-path-outside-cwd`
  - `absolute-path-outside-cwd`
- Use one active rule layer for this plugin, because this repo has no modes.
- Evaluate all bash permission patterns, not just the first pattern.
- Unknown bash command text must ask.
- Safe bash commands auto-allow once.
- Blocklist matches auto-reject.
- Prompt-rule matches leave the native OpenCode prompt for the user.
- Preserve session-scoped `allow always` tracking by normalized request key.
- Add runtime binary detection for exact binary words anywhere in bash command text:
  - `python`, `python2`, `python3`, `node`, `ruby`, `perl`, `php`, `lua`
- Add bash command path guards:
  - home-like outside cwd
  - Unix absolute outside cwd
  - skip URLs
  - lexical resolution only
  - allow paths inside plugin `directory`
  - allow paths inside configured external dirs
  - if the same path matches home and absolute rules, prefer home rule internally
- Add safe `/dev/null` redirect sanitizer:
  - Strip common `/dev/null` redirect forms before destructive and bash path detection.
  - Support spaced forms, append forms, stdout/stderr forms, combined stdout/stderr forms, input redirects, and fd duplication used with null redirects.
  - Exempt only redirect syntax, not `/dev/null` globally.
  - Exempt only `/dev/null`, not other `/dev/*` paths.
- Add config loading:
  - global: `~/.config/opencode/bash-guard.json`
  - project: `.oc-bash-guard.json`
  - schema: `{ "allowedExternalDirs": ["~/workspace/shared"] }`
  - expand `~`, `$HOME`, `${HOME}`
  - resolve relative entries from the config file location
  - invalid config fails open with warning/log
- Use Bun commands and patterns.
- Add `package.json` with Bun test script.
- Update `README.md` and `AGENTS.md`.

## Tests And Verification

- Add Bun tests for:
  - existing destructive bash detection
  - safe `/dev/null` redirects do not prompt
  - unsafe redirects still prompt
  - `cat /dev/null` still hits absolute path guard
  - runtime binaries exact matching
  - runtime false positives avoided for larger words like `node_modules` / `python_script`
  - home-like outside-cwd paths
  - home-like inside-cwd paths
  - absolute outside-cwd paths
  - allowed external dirs suppress path guards
  - URLs skipped by path extraction
  - home-like absolute paths prefer home rule over absolute rule
  - config combines global/project configs
  - config expands home references
  - config resolves relative dirs by config location
  - invalid config warns and ignores that file
- Run `bun test`.
- Optionally smoke-test in OpenCode after installing:
  - safe command like `pwd` auto-allows
  - `node --version` prompts
  - `cat ~/.zshrc` prompts
  - `kubectl ... 2>/dev/null` does not prompt only because of `/dev/null`
  - `cat /dev/null` prompts by absolute path rule

## Decisions Made By User

- Split into multiple files and organize code with boundaries.
- Use Bun commands and patterns.
- Config paths approved:
  - `~/.config/opencode/bash-guard.json`
  - `.oc-bash-guard.json`
- Keep scope bash-only for this OpenCode plugin.

## Tradeoffs And Risks

- Native OpenCode prompt text cannot be customized per named rule; named rules are internal and docs/test-visible.
- Bash string scanning is regex-based and can produce false positives in quoted text or examples.
- Runtime matching anywhere may prompt for text commands like `grep node README.md`.
- Lexical path checks do not catch symlink escapes.
- Project-local config can broaden allowed external access if a repo includes `.oc-bash-guard.json`.
- If OpenCode bash permission is globally set to `allow`, no `permission.asked` event is created and this plugin cannot guard that command.
- Split files require install docs to link/copy all plugin files, not only `bash-guard.ts`.

## Remaining Open Questions

None.

## Execution Guidance

If execution deviates from this approved plan, update this saved plan file to reflect the latest approved plan and surface the deviation to the user before continuing.
