# bash-guard

OpenCode plugin that prompts before risky bash commands and allows safe commands through.

## Behavior

`bash-guard` checks bash permission requests with named guard rules. On OpenCode 1.14.24 this uses `permission.asked` events and replies through the permission API because the documented `permission.ask` hook is not called for built-in bash.

| Match | Result |
| --- | --- |
| `blocklisted-bash` | auto-reject |
| `destructive-bash` | ask: allow once, allow always, or reject |
| `runtime-binary` | ask: allow once, allow always, or reject |
| `home-path-outside-cwd` | ask: allow once, allow always, or reject |
| `absolute-path-outside-cwd` | ask: allow once, allow always, or reject |
| no match | auto-allow once |
| unknown command text | ask |

`allow always` is session-scoped for the normalized command text.

Runtime binaries are exact word matches anywhere in bash command text: `python`, `python2`, `python3`, `node`, `ruby`, `perl`, `php`, `lua`.

Path rules scan bash command text only. They skip URLs, use lexical resolution, allow paths inside the OpenCode directory, and allow configured external dirs. Safe `/dev/null` redirect syntax is ignored for destructive and path detection, but normal references like `cat /dev/null` still prompt.

## Install Locally

Add this local package to `~/.config/opencode/package.json`:

```json
{
  "dependencies": {
    "oc-bash-guard": "file:../../workspace/opencode-plugins/packages/plugins/oc-bash-guard"
  }
}
```

Install from the OpenCode config directory:

```sh
cd ~/.config/opencode
pnpm install
```

Add the installed plugin to your OpenCode config:

```json
{
  "plugin": ["./node_modules/oc-bash-guard"]
}
```

Restart OpenCode after changing plugin files, config, or dependencies.

## Customize

Edit `guards.ts`:

- Add prompt-only patterns to `DESTRUCTIVE_PATTERNS`.
- Add deny-only patterns to `BLOCKLIST_PATTERNS`.

`BLOCKLIST_PATTERNS` starts empty by design.

Optional config:

- Global: `~/.config/opencode/bash-guard.json`
- Project: `.oc-bash-guard.json`

```json
{
  "allowedExternalDirs": ["~/workspace/shared", "$HOME/src/shared"]
}
```

Relative paths resolve from the config file location.

## Test

```sh
pnpm --filter oc-bash-guard test
```

From this package directory you can also run:

```sh
bun test
```

## Verify

Run these from an OpenCode session after installing:

```sh
pwd
touch /tmp/oc-bash-guard-test
node --version
cat ~/.zshrc
cat /dev/null
```

Expected:

- `pwd` runs without prompt.
- `touch /tmp/oc-bash-guard-test` prompts.
- `node --version` prompts.
- `cat ~/.zshrc` prompts.
- `cat /dev/null` prompts.
- Reject blocks the command.
- Allow once runs the command and prompts again next time.
- Allow always runs the same normalized command for the rest of the session.

To verify blocklist behavior, temporarily add a regex to `BLOCKLIST_PATTERNS`, confirm the matching command is rejected without prompt, then remove it.

## API Note

`context.ask` exists for custom plugin tools, but is not the right API for guarding the built-in bash tool.
