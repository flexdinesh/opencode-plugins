---
title: npm link plugin install
description: Use npm link with saved node_modules path for local OpenCode plugin install.
date: 2026-05-11
slug: npm-link-plugin-install
status: implemented
tags:
  - opencode
  - plugin
  - install
related_paths:
  - README.md
  - package.json
---

## Why

OpenCode installed through npm resolves package-name plugin specs through its npm-based loader. `bun link` can make Bun imports work locally, but OpenCode does not use Bun's global link registry when loading server plugins.

## What

- Use `npm link` from this repo.
- Use `npm link --save oc-bash-guard` from `~/.config/opencode`.
- Configure OpenCode with `"plugin": ["./node_modules/oc-bash-guard"]`, not `"oc-bash-guard"`.
- Keep package entrypoint metadata pointing at `bash-guard.ts`.

## How

`npm link --save` persists the linked dependency in `~/.config/opencode/package.json`, so future `npm install` runs do not prune `node_modules/oc-bash-guard`.

## Gotchas

Package-name plugin specs may be npm-installed into OpenCode's cache instead of using the locally linked package. Use the actual linked `node_modules` path for local development.
