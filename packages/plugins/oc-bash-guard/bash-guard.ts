import type { Permission } from "@opencode-ai/sdk";
import type { Plugin, PluginModule } from "@opencode-ai/plugin";
import { loadBashGuardConfig, type BashGuardConfig } from "./config";
import {
  BASH_GUARD_RULES,
  evaluateBashGuards,
  mostRestrictiveDecision,
} from "./guards";

type PermissionDecision = {
  sessionID: string;
  key: string;
};

type PermissionRequest = {
  id: string;
  sessionID: string;
  permission: string;
  patterns: string[];
  metadata: Record<string, unknown>;
};

type PermissionReply = {
  requestID: string;
  sessionID: string;
  reply: string;
};

const allowAlwaysBySession = new Map<string, Set<string>>();
const pendingPermissions = new Map<string, PermissionDecision>();

export const BashGuard: Plugin = async ({ client, directory }) => {
  const loadedConfig = await loadBashGuardConfig(directory);
  const bashGuardConfig: BashGuardConfig = {
    allowedExternalDirs: loadedConfig.allowedExternalDirs,
  };
  for (const warning of loadedConfig.warnings) {
    await client.app.log({
      body: {
        service: "bash-guard",
        level: "warn",
        message: warning,
      },
    });
  }

  return {
    event: async ({ event }) => {
      if (event.type === "permission.asked") {
        const request = readPermissionRequest(event);

        if (!request || request.permission !== "bash") return;

        const commands = extractRequestCommands(request);
        if (commands.length === 0) return;

        const key = normalizeCommands(commands);
        if (allowAlwaysBySession.get(request.sessionID)?.has(key)) {
          await replyToPermission(request, "once");
          return;
        }

        const findings = evaluateBashGuards(commands, BASH_GUARD_RULES, {
          cwd: directory,
          allowedExternalDirs: bashGuardConfig.allowedExternalDirs,
        });
        const decision = mostRestrictiveDecision(findings);

        if (decision === "reject") {
          await replyToPermission(request, "reject");
          return;
        }

        if (decision === "ask") {
          pendingPermissions.set(request.id, {
            sessionID: request.sessionID,
            key,
          });
          return;
        }

        await replyToPermission(request, "once");
        return;
      }

      if (event.type !== "permission.replied") return;

      const reply = readPermissionReply(event);

      if (!reply) return;

      const pending = pendingPermissions.get(reply.requestID);
      pendingPermissions.delete(reply.requestID);

      if (!pending || reply.reply !== "always") return;

      const allowed =
        allowAlwaysBySession.get(pending.sessionID) ?? new Set<string>();
      allowed.add(pending.key);
      allowAlwaysBySession.set(pending.sessionID, allowed);
    },

    "permission.ask": async (input, output) => {
      const isBash = isBashPermission(input);
      const commands = extractCommands(input);

      if (!isBash) {
        return;
      }

      if (commands.length === 0) {
        output.status = "ask";
        return;
      }

      const key = normalizeCommands(commands);
      if (allowAlwaysBySession.get(input.sessionID)?.has(key)) {
        output.status = "allow";
        return;
      }

      const findings = evaluateBashGuards(commands, BASH_GUARD_RULES, {
        cwd: directory,
        allowedExternalDirs: bashGuardConfig.allowedExternalDirs,
      });
      const decision = mostRestrictiveDecision(findings);

      if (decision === "reject") {
        output.status = "deny";
        return;
      }

      if (decision === "ask") {
        pendingPermissions.set(input.id, { sessionID: input.sessionID, key });
        output.status = "ask";
        return;
      }

      output.status = "allow";
    },
  };

  async function replyToPermission(
    request: PermissionRequest,
    response: "once" | "reject",
  ) {
    await client.postSessionIdPermissionsPermissionId({
      path: {
        id: request.sessionID,
        permissionID: request.id,
      },
      body: { response },
    });
  }
};

export const server = BashGuard;

const plugin = {
  id: "oc-bash-guard",
  server,
} satisfies PluginModule & { id: string };

export default plugin;

function isBashPermission(permission: Permission): boolean {
  return [
    permission.type,
    permission.title,
    getMetadataString(permission, "tool"),
    getMetadataString(permission, "toolID"),
    getMetadataString(permission, "toolId"),
    getMetadataString(permission, "name"),
    getNestedMetadataString(permission, "metadata", "tool"),
  ].some((value) => value?.toLowerCase() === "bash");
}

function extractCommands(permission: Permission): string[] {
  const fromMetadata = [
    getMetadataString(permission, "command"),
    getMetadataString(permission, "cmd"),
    getNestedMetadataString(permission, "args", "command"),
    getNestedMetadataString(permission, "input", "command"),
  ].find(isNonEmptyString);

  if (fromMetadata) return [fromMetadata];

  const pattern = permission.pattern;
  if (typeof pattern === "string" && pattern.trim()) {
    return [pattern];
  }

  if (Array.isArray(pattern)) {
    return pattern.filter(isNonEmptyString);
  }

  return [];
}

function extractRequestCommands(request: PermissionRequest): string[] {
  const fromMetadata = [
    getRecordString(request.metadata, "command"),
    getRecordString(request.metadata, "cmd"),
    getNestedRecordString(request.metadata, "args", "command"),
    getNestedRecordString(request.metadata, "input", "command"),
  ].find(isNonEmptyString);

  if (fromMetadata) return [fromMetadata];

  return request.patterns.filter(isNonEmptyString);
}

function readPermissionRequest(value: unknown): PermissionRequest | undefined {
  if (
    !isRecord(value) ||
    value.type !== "permission.asked" ||
    !isRecord(value.properties)
  )
    return undefined;

  const properties = value.properties;
  const id = getRecordString(properties, "id");
  const sessionID = getRecordString(properties, "sessionID");
  const permission = getRecordString(properties, "permission");
  const patterns = properties.patterns;
  const metadata = properties.metadata;

  if (
    !id ||
    !sessionID ||
    !permission ||
    !isStringArray(patterns) ||
    !isRecord(metadata)
  )
    return undefined;

  return { id, sessionID, permission, patterns, metadata };
}

function readPermissionReply(value: unknown): PermissionReply | undefined {
  if (
    !isRecord(value) ||
    value.type !== "permission.replied" ||
    !isRecord(value.properties)
  )
    return undefined;

  const properties = value.properties;
  const requestID = getRecordString(properties, "requestID");
  const sessionID = getRecordString(properties, "sessionID");
  const reply = getRecordString(properties, "reply");

  if (!requestID || !sessionID || !reply) return undefined;

  return { requestID, sessionID, reply };
}

function getMetadataString(
  permission: Permission,
  key: string,
): string | undefined {
  return getRecordString(permission.metadata, key);
}

function getNestedMetadataString(
  permission: Permission,
  parent: string,
  child: string,
): string | undefined {
  return getNestedRecordString(permission.metadata, parent, child);
}

function getRecordString(
  record: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

function getNestedRecordString(
  record: Record<string, unknown>,
  parent: string,
  child: string,
): string | undefined {
  const value = record[parent];
  if (!isRecord(value)) return undefined;

  const nested = value[child];
  return typeof nested === "string" ? nested : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

function isNonEmptyString(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeCommands(commands: string[]): string {
  return commands.map((command) => command.trim().replace(/\s+/g, " ")).join("\n");
}
