---
title: Bash guard named rules
description: Refactor OpenCode bash guard around named bash-only safety rules with runtime, path, config, and /dev/null redirect handling.
date: 2026-05-11
slug: bash-guard-rules
status: implemented
tags:
  - opencode
  - plugin
  - bash
  - safety
related_paths:
  - bash-guard.ts
  - guards.ts
  - config.ts
  - guards.test.ts
  - README.md
  - AGENTS.md
---

## Why

The original OpenCode bash guard only checked destructive bash regexes and blocklist regexes. It did not catch agents using runtime binaries such as `node` or `python`, and it did not guard bash commands that reference sensitive paths outside the current OpenCode directory.

The related Pi mode guard work added named rules, runtime prompts, outside-cwd path prompts, config-backed allowed external dirs, and a narrow safe `/dev/null` redirect exemption. This plugin should follow the same safety model where OpenCode plugin semantics allow it.

## What

- Keep scope bash-only.
- Keep built-in bash guarding based on `permission.asked` events plus the permission reply API.
- Keep `permission.ask` only as a compatibility hook.
- Do not use `context.ask`, because it is for custom plugin tools.
- Split implementation by boundary:
  - `bash-guard.ts`: OpenCode plugin and permission integration.
  - `guards.ts`: named rules and guard evaluation.
  - `config.ts`: config loading and path resolution.
- Add named guard rules:
  - `blocklisted-bash`
  - `destructive-bash`
  - `runtime-binary`
  - `home-path-outside-cwd`
  - `absolute-path-outside-cwd`
- Evaluate all bash permission patterns, not only the first pattern.
- Add runtime binary prompts for exact words: `python`, `python2`, `python3`, `node`, `ruby`, `perl`, `php`, `lua`.
- Add bash command path prompts for home-like paths and Unix absolute paths outside the OpenCode directory.
- Add config-backed `allowedExternalDirs`.
- Add safe `/dev/null` redirect sanitizer so redirects to `/dev/null` do not trigger destructive/path rules, while normal references like `cat /dev/null` remain guarded.
- Add Bun test setup and regression coverage.

## How

- Global config path: `~/.config/opencode/bash-guard.json`.
- Project config path: `.oc-bash-guard.json`.
- Config schema:
  ```json
  {
    "allowedExternalDirs": ["~/workspace/shared", "$HOME/src/shared"]
  }
  ```
- Config expands `~`, `$HOME`, and `${HOME}`.
- Relative config entries resolve from the config file location.
- Invalid config fails open with a warning and contributes no dirs from that file.
- Path checks use lexical resolution only.
- URL path portions are skipped during bash string path scanning.
- If a home-like absolute path matches both path rules, prefer `home-path-outside-cwd`.
- Safe `/dev/null` redirect handling strips common stdout/stderr/input/append/combined redirect forms before destructive and path checks.

## Tradeoffs

- OpenCode native prompt text cannot be customized per rule, so named rules are internal, test-visible, and documented but not shown as custom prompt UI.
- Bash scanning is regex-based and protective, so quoted examples or commands like `grep node README.md` can prompt.
- Lexical path checks do not catch symlink escapes.
- Project-local config can broaden allowed external access if a repo includes `.oc-bash-guard.json`.
- If OpenCode bash permission is globally set to `allow`, no `permission.asked` event is emitted, so this plugin cannot guard that bash command.
- Splitting files improves boundaries but install docs must link all plugin files, not only `bash-guard.ts`.
- The `/dev/null` exemption is intentionally narrow: redirect syntax only, `/dev/null` only, no broader `/dev/*` allowlist.
