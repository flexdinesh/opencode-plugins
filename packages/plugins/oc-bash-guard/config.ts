import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";

export interface BashGuardConfig {
  allowedExternalDirs: string[];
}

export interface LoadedBashGuardConfig extends BashGuardConfig {
  warnings: string[];
}

interface ConfigFileSpec {
  path: string;
  baseDir: string;
  label: string;
}

const DEFAULT_CONFIG: BashGuardConfig = {
  allowedExternalDirs: [],
};

export function resolveConfiguredDir(
  value: string,
  baseDir: string,
  homeDir = homedir(),
): string {
  const expanded = expandHomeReferences(value, homeDir);
  return isAbsolute(expanded) ? resolve(expanded) : resolve(baseDir, expanded);
}

export async function loadBashGuardConfig(
  cwd: string,
  homeDir = homedir(),
): Promise<LoadedBashGuardConfig> {
  const globalConfigPath = join(
    homeDir,
    ".config",
    "opencode",
    "bash-guard.json",
  );
  const projectConfigPath = join(cwd, ".oc-bash-guard.json");
  const specs: ConfigFileSpec[] = [
    { path: globalConfigPath, baseDir: dirname(globalConfigPath), label: "global" },
    { path: projectConfigPath, baseDir: cwd, label: "project" },
  ];

  const configs = await Promise.all(
    specs.map((spec) => readConfigFile(spec, homeDir)),
  );
  return {
    allowedExternalDirs: unique(
      configs.flatMap((config) => config.allowedExternalDirs),
    ),
    warnings: configs.flatMap((config) => config.warnings),
  };
}

async function readConfigFile(
  spec: ConfigFileSpec,
  homeDir: string,
): Promise<LoadedBashGuardConfig> {
  let content: string;
  try {
    content = await readFile(spec.path, "utf8");
  } catch (error) {
    if (isErrorWithCode(error) && error.code === "ENOENT") {
      return { ...DEFAULT_CONFIG, warnings: [] };
    }
    return {
      ...DEFAULT_CONFIG,
      warnings: [
        `Could not read ${spec.label} config at ${spec.path}: ${errorMessage(error)}`,
      ],
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    return {
      ...DEFAULT_CONFIG,
      warnings: [
        `Ignoring invalid ${spec.label} config at ${spec.path}: ${errorMessage(error)}`,
      ],
    };
  }

  if (!isRecord(parsed)) {
    return {
      ...DEFAULT_CONFIG,
      warnings: [
        `Ignoring invalid ${spec.label} config at ${spec.path}: expected a JSON object.`,
      ],
    };
  }

  const allowedExternalDirs = parsed.allowedExternalDirs;
  if (allowedExternalDirs === undefined) {
    return { ...DEFAULT_CONFIG, warnings: [] };
  }
  if (
    !Array.isArray(allowedExternalDirs) ||
    !allowedExternalDirs.every((value) => typeof value === "string")
  ) {
    return {
      ...DEFAULT_CONFIG,
      warnings: [
        `Ignoring invalid ${spec.label} config at ${spec.path}: allowedExternalDirs must be an array of strings.`,
      ],
    };
  }

  return {
    allowedExternalDirs: allowedExternalDirs.map((dir) =>
      resolveConfiguredDir(dir, spec.baseDir, homeDir),
    ),
    warnings: [],
  };
}

function expandHomeReferences(value: string, homeDir: string): string {
  let expanded = value;
  if (expanded === "~") {
    expanded = homeDir;
  } else if (expanded.startsWith("~/")) {
    expanded = join(homeDir, expanded.slice(2));
  }
  return expanded.replaceAll("${HOME}", homeDir).replaceAll("$HOME", homeDir);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isErrorWithCode(error: unknown): error is { code: string } {
  return isRecord(error) && typeof error.code === "string";
}
