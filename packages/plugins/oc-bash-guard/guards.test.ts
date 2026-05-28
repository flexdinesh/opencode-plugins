import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { loadBashGuardConfig } from "./config";
import {
  BASH_GUARD_RULES,
  detectRuntimeBinaries,
  evaluateBashGuards,
  isDestructiveCommand,
  type GuardContext,
  type GuardRuleName,
} from "./guards";

const context: GuardContext = {
  cwd: "/Users/me/workspace/project",
  homeDir: "/Users/me",
  allowedExternalDirs: [],
};

let tempRoots: string[] = [];

beforeEach(() => {
  tempRoots = [];
});

afterEach(async () => {
  await Promise.all(
    tempRoots.map((tempRoot) => rm(tempRoot, { recursive: true, force: true })),
  );
});

function findings(
  command: string,
  rules: GuardRuleName[] = BASH_GUARD_RULES,
  ctx = context,
): GuardRuleName[] {
  return evaluateBashGuards([command], rules, ctx).map((finding) => finding.rule);
}

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "bash-guard-test-"));
  tempRoots.push(dir);
  return dir;
}

describe("bash guard rules", () => {
  test("existing destructive bash detection still works", () => {
    expect(isDestructiveCommand("rm -rf dist")).toBe(true);
    expect(isDestructiveCommand("git status --short")).toBe(false);
  });

  test("safe /dev/null redirects do not trigger destructive or absolute path guards", () => {
    expect(
      findings(
        "kubectl -n postgres-ha describe scheduledbackup postgres-cluster-backup 2>/dev/null | head -30",
      ),
    ).toEqual([]);
    expect(
      findings("kubectl -n longhorn-system get recurringjob --no-headers 2> /dev/null"),
    ).toEqual([]);
    expect(findings("curl https://example.com &>>/dev/null")).toEqual([]);
    expect(findings("grep pattern < /dev/null >/dev/null 2>&1")).toEqual([]);
  });

  test("unsafe redirects and non-redirect /dev/null paths still trigger", () => {
    expect(isDestructiveCommand("echo hi > /tmp/out")).toBe(true);
    expect(isDestructiveCommand("echo hi >> output.txt")).toBe(true);
    expect(isDestructiveCommand("echo warning >&2")).toBe(true);
    expect(findings("cat /dev/null", ["absolute-path-outside-cwd"])).toEqual([
      "absolute-path-outside-cwd",
    ]);
    expect(findings("cat /etc/hosts 2>/dev/null", ["absolute-path-outside-cwd"])).toEqual([
      "absolute-path-outside-cwd",
    ]);
  });

  test("runtime binaries trigger as exact words anywhere", () => {
    expect(detectRuntimeBinaries("node --version && python -V && /usr/bin/ruby -v")).toEqual([
      "node",
      "python",
      "ruby",
    ]);
    expect(findings("grep node README.md", ["runtime-binary"])).toEqual([
      "runtime-binary",
    ]);
  });

  test("runtime binaries do not trigger inside larger words", () => {
    expect(detectRuntimeBinaries("ls node_modules && echo python_script && cat my-node-notes.txt")).toEqual([]);
  });

  test("home-like outside-cwd paths trigger", () => {
    expect(findings("cat ~/.zshrc", ["home-path-outside-cwd"])).toEqual([
      "home-path-outside-cwd",
    ]);
    expect(findings("cat $HOME/.ssh/config", ["home-path-outside-cwd"])).toEqual([
      "home-path-outside-cwd",
    ]);
  });

  test("home-like paths inside cwd do not trigger", () => {
    expect(findings("ls ~/workspace/project/src", ["home-path-outside-cwd"])).toEqual([]);
    expect(findings("cat /Users/me/workspace/project/package.json", ["home-path-outside-cwd"])).toEqual([]);
  });

  test("absolute outside-cwd paths trigger", () => {
    expect(findings("cat /etc/hosts /var/log/system.log", ["absolute-path-outside-cwd"])).toEqual([
      "absolute-path-outside-cwd",
    ]);
    expect(findings("ls /", ["absolute-path-outside-cwd"])).toEqual([
      "absolute-path-outside-cwd",
    ]);
  });

  test("allowed external dirs suppress home-like and absolute path rules", () => {
    const allowedContext: GuardContext = {
      ...context,
      allowedExternalDirs: ["/Users/me/workspace/other-repo"],
    };

    expect(
      findings(
        "cat ~/workspace/other-repo/src/file.ts /Users/me/workspace/other-repo/package.json",
        ["home-path-outside-cwd", "absolute-path-outside-cwd"],
        allowedContext,
      ),
    ).toEqual([]);
  });

  test("URLs are skipped by path extraction", () => {
    expect(
      findings(
        "echo https://example.com/Users/me/.ssh/config https://example.com/api/v1",
        ["home-path-outside-cwd", "absolute-path-outside-cwd"],
      ),
    ).toEqual([]);
  });

  test("home-like absolute paths prefer home rule over absolute rule for the same path", () => {
    expect(
      findings("cat /Users/me/.ssh/config", [
        "home-path-outside-cwd",
        "absolute-path-outside-cwd",
      ]),
    ).toEqual(["home-path-outside-cwd"]);
  });

  test("multiple permission patterns are evaluated", () => {
    const rules = evaluateBashGuards(
      ["pwd", "node --version", "cat /etc/hosts"],
      ["runtime-binary", "absolute-path-outside-cwd"],
      context,
    ).map((finding) => finding.rule);

    expect(rules).toEqual(["runtime-binary", "absolute-path-outside-cwd"]);
  });

  test("safe null redirects in one pattern do not mask unsafe redirects in another", () => {
    const rules = evaluateBashGuards(
      ["grep pattern >/dev/null 2>&1", "echo warning >&2"],
      ["destructive-bash"],
      context,
    ).map((finding) => finding.rule);

    expect(rules).toEqual(["destructive-bash"]);
  });
});

describe("bash guard config", () => {
  test("config loading combines global and project configs with expansion and relative resolution", async () => {
    const tempRoot = await tempDir();
    const homeDir = join(tempRoot, "home");
    const cwd = join(homeDir, "workspace", "project");
    const globalConfigDir = join(homeDir, ".config", "opencode");
    await mkdir(globalConfigDir, { recursive: true });
    await mkdir(cwd, { recursive: true });

    await writeFile(
      join(globalConfigDir, "bash-guard.json"),
      JSON.stringify({ allowedExternalDirs: ["~/workspace/shared", "relative-global"] }),
    );
    await writeFile(
      join(cwd, ".oc-bash-guard.json"),
      JSON.stringify({ allowedExternalDirs: ["$HOME/src/shared", "../sibling"] }),
    );

    const config = await loadBashGuardConfig(cwd, homeDir);
    expect(config.warnings).toEqual([]);
    expect(config.allowedExternalDirs.sort()).toEqual(
      [
        resolve(globalConfigDir, "relative-global"),
        resolve(homeDir, "src/shared"),
        resolve(homeDir, "workspace/project/../sibling"),
        resolve(homeDir, "workspace/shared"),
      ].sort(),
    );
  });

  test("invalid config warns and ignores that file", async () => {
    const tempRoot = await tempDir();
    const homeDir = join(tempRoot, "home");
    const cwd = join(homeDir, "workspace", "project");
    const globalConfigDir = join(homeDir, ".config", "opencode");
    await mkdir(globalConfigDir, { recursive: true });
    await mkdir(cwd, { recursive: true });

    await writeFile(join(globalConfigDir, "bash-guard.json"), "{not-json");
    await writeFile(
      join(cwd, ".oc-bash-guard.json"),
      JSON.stringify({ allowedExternalDirs: ["../shared"] }),
    );

    const config = await loadBashGuardConfig(cwd, homeDir);
    expect(config.warnings).toHaveLength(1);
    expect(config.warnings[0]).toContain("Ignoring invalid global config");
    expect(config.allowedExternalDirs).toEqual([resolve(cwd, "../shared")]);
  });
});
