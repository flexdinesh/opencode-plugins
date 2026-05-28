import { homedir } from "node:os";
import { isAbsolute, relative, resolve } from "node:path";

export type GuardRuleName =
  | "blocklisted-bash"
  | "destructive-bash"
  | "runtime-binary"
  | "home-path-outside-cwd"
  | "absolute-path-outside-cwd";

export type GuardDecision = "allow" | "ask" | "reject";

export interface GuardContext {
  cwd: string;
  allowedExternalDirs: string[];
  homeDir?: string;
}

export interface PathMatch {
  input: string;
  resolved: string;
}

export interface GuardFinding {
  rule: GuardRuleName;
  decision: GuardDecision;
  matches: string[];
  paths?: PathMatch[];
}

export const BASH_GUARD_RULES: GuardRuleName[] = [
  "blocklisted-bash",
  "destructive-bash",
  "runtime-binary",
  "home-path-outside-cwd",
  "absolute-path-outside-cwd",
];

export const DESTRUCTIVE_PATTERNS = [
  /\brm\b/i,
  /\brmdir\b/i,
  /\bmv\b/i,
  /\bcp\b/i,
  /\bmkdir\b/i,
  /\btouch\b/i,
  /\bchmod\b/i,
  /\bchown\b/i,
  /\bchgrp\b/i,
  /\bln\b/i,
  /\btee\b/i,
  /\btruncate\b/i,
  /\bdd\b/i,
  /\bshred\b/i,
  /(^|[^<])\>(?!>)/,
  /\>\>/,
  /\bnpm\s+(install|uninstall|update|ci|link|publish)/i,
  /\byarn\s+(add|remove|install|publish)/i,
  /\bpnpm\s+(add|remove|install|publish)/i,
  /\bpip\s+(install|uninstall)/i,
  /\bapt(\-get)?\s+(install|remove|purge|update|upgrade)/i,
  /\bbrew\s+(install|uninstall|upgrade)/i,
  /\bgit\s+(add|commit|push|pull|merge|rebase|reset|checkout|branch\s+\-[dD]|stash|cherry\-pick|revert|tag|init|clone)/i,
  /\bsudo\b/i,
  /\bsu\b/i,
  /\bkill\b/i,
  /\bpkill\b/i,
  /\bkillall\b/i,
  /\breboot\b/i,
  /\bshutdown\b/i,
  /\bsystemctl\s+(start|stop|restart|enable|disable)/i,
  /\bservice\s+\S+\s+(start|stop|restart)/i,
  /\b(vim?|nano|emacs|code|subl)\b/i,
];

export const BLOCKLIST_PATTERNS: RegExp[] = [];

export const RUNTIME_BINARIES = [
  "python",
  "python2",
  "python3",
  "node",
  "ruby",
  "perl",
  "php",
  "lua",
];

const RUNTIME_BINARY_PATTERN =
  /(?<![A-Za-z0-9_-])(python3|python2|python|node|ruby|perl|php|lua)(?![A-Za-z0-9_-])/gi;
const URL_PATTERN = /\b[A-Za-z][A-Za-z0-9+.-]*:\/\/[^\s"'`<>)]*/g;
const HOME_PATH_PATTERN =
  /~(?:\/[^\s"'`<>);|&]*)?|\$\{HOME\}(?:\/[^\s"'`<>);|&]*)?|\$HOME(?:\/[^\s"'`<>);|&]*)?|\/Users\/[^\s"'`<>);|&]*|\/home\/[^\s"'`<>);|&]*|\/root\/[^\s"'`<>);|&]*/g;
const ABSOLUTE_PATH_PATTERN =
  /(?:^|[^A-Za-z0-9_~}.:-])(\/(?:[A-Za-z0-9._~@%+\-][^\s"'`<>);|&]*)?)/g;
const TRAILING_PUNCTUATION_PATTERN = /[,.]+$/;

export function stripSafeNullRedirects(command: string): string {
  const withoutNullRedirects = command.replace(
    /(?:\d*>>?|&>>?|\d*<)\s*\/dev\/null\b/g,
    "",
  );
  if (withoutNullRedirects === command) return command;
  return withoutNullRedirects.replace(/\d*>&\d+\b/g, "");
}

export function isDestructiveCommand(command: string): boolean {
  const commandForDetection = stripSafeNullRedirects(command);
  return DESTRUCTIVE_PATTERNS.some((pattern) =>
    pattern.test(commandForDetection),
  );
}

export function isBlocklistedCommand(command: string): boolean {
  return BLOCKLIST_PATTERNS.some((pattern) => pattern.test(command));
}

export function detectRuntimeBinaries(command: string): string[] {
  return unique(
    [...command.matchAll(RUNTIME_BINARY_PATTERN)].map((match) =>
      match[1].toLowerCase(),
    ),
  );
}

export function detectHomePathMatches(
  input: string,
  context: GuardContext,
): PathMatch[] {
  const homeDir = context.homeDir ?? homedir();
  const matches: PathMatch[] = [];
  for (const match of stripUrls(input).matchAll(HOME_PATH_PATTERN)) {
    const candidate = cleanPathCandidate(match[0]);
    const resolvedPath = resolveHomePath(candidate, homeDir);
    if (!resolvedPath) continue;
    if (isAllowedPath(resolvedPath, context)) continue;
    matches.push({ input: candidate, resolved: resolvedPath });
  }
  return uniquePaths(matches);
}

export function detectAbsolutePathMatches(
  input: string,
  context: GuardContext,
  excludedResolvedPaths: string[] = [],
): PathMatch[] {
  const excluded = new Set(excludedResolvedPaths.map((path) => resolve(path)));
  const matches: PathMatch[] = [];
  for (const match of stripUrls(input).matchAll(ABSOLUTE_PATH_PATTERN)) {
    const candidate = cleanPathCandidate(match[1]);
    const resolvedPath = resolve(candidate);
    if (excluded.has(resolvedPath)) continue;
    if (isAllowedPath(resolvedPath, context)) continue;
    matches.push({ input: candidate, resolved: resolvedPath });
  }
  return uniquePaths(matches);
}

export function evaluateBashGuards(
  commands: string[],
  enabledRules: readonly GuardRuleName[],
  context: GuardContext,
): GuardFinding[] {
  const enabled = new Set(enabledRules);
  const findings: GuardFinding[] = [];
  const homeExcludedPaths: string[] = [];
  const commandText = commands.join("\n");
  const commandForPathDetection = commands.map(stripSafeNullRedirects).join("\n");

  if (enabled.has("blocklisted-bash") && isBlocklistedCommand(commandText)) {
    findings.push({
      rule: "blocklisted-bash",
      decision: "reject",
      matches: commands,
    });
  }

  if (enabled.has("destructive-bash")) {
    const matches = commands.filter(isDestructiveCommand);
    if (matches.length > 0) {
      findings.push({
        rule: "destructive-bash",
        decision: "ask",
        matches,
      });
    }
  }

  if (enabled.has("runtime-binary")) {
    const binaries = detectRuntimeBinaries(commandText);
    if (binaries.length > 0) {
      findings.push({
        rule: "runtime-binary",
        decision: "ask",
        matches: binaries,
      });
    }
  }

  if (enabled.has("home-path-outside-cwd")) {
    const paths = detectHomePathMatches(commandForPathDetection, context);
    homeExcludedPaths.push(...paths.map((path) => path.resolved));
    if (paths.length > 0) {
      findings.push({
        rule: "home-path-outside-cwd",
        decision: "ask",
        matches: paths.map((path) => path.input),
        paths,
      });
    }
  }

  if (enabled.has("absolute-path-outside-cwd")) {
    const paths = detectAbsolutePathMatches(
      commandForPathDetection,
      context,
      homeExcludedPaths,
    );
    if (paths.length > 0) {
      findings.push({
        rule: "absolute-path-outside-cwd",
        decision: "ask",
        matches: paths.map((path) => path.input),
        paths,
      });
    }
  }

  return findings;
}

export function mostRestrictiveDecision(
  findings: readonly GuardFinding[],
): GuardDecision {
  if (findings.some((finding) => finding.decision === "reject")) return "reject";
  if (findings.some((finding) => finding.decision === "ask")) return "ask";
  return "allow";
}

function stripUrls(input: string): string {
  return input.replace(URL_PATTERN, " ");
}

function cleanPathCandidate(candidate: string): string {
  return candidate.replace(TRAILING_PUNCTUATION_PATTERN, "");
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function uniquePaths(paths: PathMatch[]): PathMatch[] {
  const seen = new Set<string>();
  const uniqueMatches: PathMatch[] = [];
  for (const path of paths) {
    const key = `${path.input}\0${path.resolved}`;
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueMatches.push(path);
  }
  return uniqueMatches;
}

function resolveHomePath(candidate: string, homeDir: string): string | undefined {
  if (candidate === "~") return homeDir;
  if (candidate.startsWith("~/")) return resolve(homeDir, candidate.slice(2));
  if (candidate === "$HOME") return homeDir;
  if (candidate.startsWith("$HOME/")) return resolve(homeDir, candidate.slice(6));
  if (candidate === "${HOME}") return homeDir;
  if (candidate.startsWith("${HOME}/")) return resolve(homeDir, candidate.slice(8));
  if (
    candidate.startsWith("/Users/") ||
    candidate.startsWith("/home/") ||
    candidate.startsWith("/root/")
  ) {
    return resolve(candidate);
  }
  return undefined;
}

function isInsideOrEqual(basePath: string, targetPath: string): boolean {
  const relativePath = relative(resolve(basePath), resolve(targetPath));
  return (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !isAbsolute(relativePath))
  );
}

function isAllowedPath(resolvedPath: string, context: GuardContext): boolean {
  if (isInsideOrEqual(context.cwd, resolvedPath)) return true;
  return context.allowedExternalDirs.some((allowedDir) =>
    isInsideOrEqual(allowedDir, resolvedPath),
  );
}
