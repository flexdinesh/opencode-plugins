# Convert opencode-plugins to pnpm monorepo

## Summary

Set up this empty repo as a central pnpm workspace for OpenCode plugins under `packages/plugins/*`, import the three existing sibling plugin codebases, remove package-local Bun lock usage, modernize plugin module exports where needed, and document shared conventions.

## Key implementation changes

### 1. Create pnpm monorepo scaffold

Add root files:

```txt
package.json
pnpm-workspace.yaml
pnpm-lock.yaml
.gitignore
README.md
AGENTS.md
```

Root workspace layout:

```txt
packages/
  plugins/
    oc-bash-guard/
    oc-tps/
    oc-timer/
```

Root `package.json` will be a workspace aggregator with scripts like:

- `test`
- `check`
- `build`

using recursive pnpm commands where package scripts exist.

The root package can remain a non-published workspace container; plugin packages themselves will not be private.

### 2. Import plugin code without preserving git history

Copy tracked source/docs/assets from:

- `../oc-bash-guard` → `packages/plugins/oc-bash-guard`
- `../oc-tps` → `packages/plugins/oc-tps`
- `../oc-timer` → `packages/plugins/oc-timer`

Do not delete or modify the original sibling repos.

Do not copy:

- `.git/`
- `node_modules/`
- generated/local-only lockfiles like `bun.lock`

### 3. Convert package manifests for workspace use

For each plugin package:

- Keep package names:
  - `oc-bash-guard`
  - `oc-tps`
  - `oc-timer`
- Remove `"private": true` from `oc-bash-guard`.
- Keep direct TypeScript/TSX source exports for now; no `dist/` build step.
- Keep peer dependencies on OpenCode/TUI packages.
- Add or normalize scripts where useful:
  - `oc-bash-guard`: `test: bun test`
  - TUI plugins: optional `check` script using the existing Bun build-style validation pattern.

### 4. Remove package-local Bun lock

Remove `packages/plugins/oc-bash-guard/bun.lock`.

Generate/use a root `pnpm-lock.yaml` for workspace dependency state.

Bun may still be used by scripts where it is the current test/build runner.

### 5. Modernize `oc-bash-guard` plugin export

Update `oc-bash-guard` from legacy default function export to the current OpenCode module shape:

```ts
export const server = BashGuard

const plugin = {
  id: "oc-bash-guard",
  server,
} satisfies PluginModule & { id: string }

export default plugin
```

Also update imports/types as needed:

```ts
import type { Plugin, PluginModule } from "@opencode-ai/plugin"
```

Preserve behavior:

- Use `permission.asked` events + permission reply API for built-in bash.
- Keep `permission.ask` only as compatibility.
- Do not use `context.ask`.
- Non-bash permissions remain unchanged.
- Unknown bash command text asks.
- Safe commands auto-allow once.
- Blocklisted commands auto-reject.
- Prompt-rule matches leave native OpenCode prompt.
- `allow always` remains session-scoped by normalized command text.

### 6. Preserve and surface existing conventions

Carry over `oc-bash-guard` docs and agent notes, including:

- `AGENTS.md`
- `docs/decision-log/*`
- existing `.ai/plans/*` if desired as historical local planning docs

Add root `AGENTS.md` with shared plugin conventions:

- Server plugin modules export `{ id, server }`.
- TUI plugin modules export `{ id, tui }`.
- Do not mix server and TUI exports in one module.
- Prefer typed `PluginModule` / `TuiPluginModule`.
- Keep package source entrypoints explicit.
- Use pnpm workspace management, but Bun is acceptable inside scripts where existing plugins already rely on it.
- For bash guard specifically, preserve its stricter safety rules.

### 7. Update documentation

Root `README.md` should document:

- Workspace purpose.
- Directory layout.
- How to add a new plugin under `packages/plugins/*`.
- How to run tests/checks.
- Local development/install notes for OpenCode plugin loading.
- Existing plugins table:
  - `oc-bash-guard` — server plugin
  - `oc-tps` — TUI plugin
  - `oc-timer` — TUI plugin

Package READMEs should be updated only where paths/install instructions need to reflect the monorepo.

## Tests and verification

After implementation:

1. Install workspace dependencies:

```sh
pnpm install
```

2. Run root tests/checks:

```sh
pnpm test
pnpm check
```

3. Specifically verify `oc-bash-guard`:

```sh
pnpm --filter oc-bash-guard test
```

4. Verify TUI plugin TSX compiles/checks if scripts are added:

```sh
pnpm --filter oc-tps check
pnpm --filter oc-timer check
```

5. Inspect final tree:

```sh
find packages/plugins -maxdepth 2 -type f
```

6. Confirm no unwanted copies:

- no nested `.git`
- no `node_modules`
- no `bun.lock`

## Decisions made by the user

- Do not preserve git history.
- Import the code but do not delete original sibling repos.
- Remove package-local `bun.lock`.
- Modernize `oc-bash-guard` to current OpenCode plugin module export shape.
- Plugin packages do not need to be private.

## Tradeoffs and risks

- Not preserving git history keeps the monorepo simple but loses per-plugin commit provenance inside this repo.
- Keeping source entrypoints as `.ts`/`.tsx` is best for current local plugin development, but a future publishing workflow may need `dist/` builds.
- `oc-bash-guard` export modernization should be low-risk, but it changes the module shape OpenCode sees. Tests plus a manual OpenCode smoke test are recommended.
- Bun remains needed for current test/check scripts even though dependency management is pnpm.

## Execution guidance

If implementation deviates from this plan, update this saved plan file to reflect the latest approved approach and surface the deviation before continuing.
