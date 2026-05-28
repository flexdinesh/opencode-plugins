# Bash Guard Plugin Plan

## Summary

Build a minimal OpenCode server plugin in `/Users/dineshpandiyan/workspace/oc-bash-guard` that guards bash commands with regex-based allow, ask, and deny behavior.

## Key Implementation Changes

- Create `bash-guard.ts`.
- Export a typed OpenCode `Plugin`.
- Use the server `permission.ask` hook, not `context.ask`.
- Keep `context.ask` documented as custom-tool-only, not the right API for guarding the built-in bash tool.
- Add `DESTRUCTIVE_PATTERNS` from the user prompt.
- Add `BLOCKLIST_PATTERNS = []` for deny-only rules.
- Match bash command text from permission `pattern` and metadata.
- Leave non-bash permissions unchanged.
- For bash commands:
  - Blocklist match: `deny`.
  - Blacklist match: `ask`.
  - No match: `allow`.
  - Unknown command text: `ask`.
- Track `allowAlways` per session via permission events where possible.
- Create `AGENTS.md`.
- Create `README.md` with install, symlink, customization, and verification docs.

## Tests Or Verification

- `pwd` or `ls`: no prompt.
- `touch /tmp/oc-bash-guard-test`: prompt.
- Reject: command rejected.
- Allow once: command runs, repeat prompts again.
- Allow always: repeat same command in same session without prompt.
- Temporary blocklist test: add one pattern locally, confirm deny without prompt, then remove.
- Run TypeScript parsing/type checks available without adding extra scaffold.

## Decisions Made By User

- Blocklist starts empty.
- Use `permission.ask`.
- Minimal TypeScript plugin scaffold only.
- Unknown bash command text asks user.

## Tradeoffs And Risks

- OpenCode permission payload shape may change; fallback is ask, not allow.
- Prompt labels are native OpenCode behavior; plugin controls `allow`, `ask`, and `deny`, not UI wording.
- Minimal scaffold avoids package/build files but limits automated test ergonomics.

## Remaining Open Questions

None.

## Execution Guidance

If execution deviates from this plan, update this file to reflect the latest approved plan and surface the deviation to the user.
