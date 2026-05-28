---
title: Bash guard uses permission events
description: Keep bash-guard event-based to preserve built-in bash behavior while filtering noisy safe prompts.
date: 2026-04-26
slug: bash-guard-permission-events
status: implemented
tags:
  - opencode
  - plugin
  - permissions
related_paths:
  - bash-guard.ts
  - AGENTS.md
  - README.md
---

## Why

OpenCode 1.14.24 loads `permission.ask`, but does not call it for built-in bash permissions. Built-in bash prompts are emitted as `permission.asked` events after config evaluation.

## What

Keep the current plugin design: use `permission.asked` events and the permission reply API for built-in bash guard behavior.

Do not switch to a custom bash tool override for now.

## How

Safe bash commands are auto-replied with `once`. Blocklisted commands are auto-replied with `reject`. Destructive commands are left for the native OpenCode prompt so the user can choose allow once, allow always, or reject.

## Tradeoffs

This preserves OpenCode's built-in bash execution behavior and keeps the plugin minimal.

Safe commands still create a native permission event briefly, so notification plugins that react to all permission prompts may still fire before bash-guard auto-replies.

## Gotchas

If global bash permission is changed to `allow`, no native `permission.asked` event is created, so this plugin cannot prompt for destructive commands.

`context.ask` is only for custom plugin tools and should not be used for the built-in bash guard.
