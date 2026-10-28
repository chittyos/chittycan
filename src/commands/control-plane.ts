import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import {
  DEFAULT_CANON_URL,
  DEFAULT_CONFIG_URL,
  DEFAULT_CONNECT_URL,
  ControlPlaneError,
  controlPlaneRequest,
  decodeJwtClaims,
  getGitHubActionsOidcToken,
  redactedToken,
} from "../lib/control-plane.js";

const PLTEA_KEYS: Record<string, RegExp> = {
  persons_p: /^P:[A-Z0-9_-]+$/,
  locations_l: /^L:[A-Z0-9_-]+$/,
  things_t: /^T:[A-Z0-9_-]+$/,
  events_e: /^E:[A-Z0-9_-]+$/,
  authorities_a: /^A:[A-Z0-9_-]+$/,
};

function emit(value: unknown, json = false): void {
  if (json || typeof value !== "string") console.log(JSON.stringify(value, null, 2));
  else console.log(value);
}

function expandPattern(pattern: string): string[] {
  if (!pattern.includes("*")) return [pattern];
  const dir = path.dirname(pattern);
  const base = path.basename(pattern);
  const regex = new RegExp(`^${base.split("*").map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`);
  return fs.readdirSync(dir === "." ? process.cwd() : dir)
    .filter((name) => regex.test(name))
    .map((name) => path.join(dir, name));
}

function readFrontmatter(file: string): { data: Record<string, any>; body: string } {
  const raw = fs.readFileSync(file, "utf8");
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) throw new ControlPlaneError(`${file}: missing YAML frontmatter`);
  const data = YAML.parse(match[1]) as Record<string, any>;
  return { data: data ?? {}, body: raw.slice(match[0].length) };
}

export function validatePlteaFiles(
  patterns: string[],
  options: { requireWorkflowGate?: string; forbidStaticEntities?: boolean } = {},
): { valid: boolean; files: Array<{ file: string; violations: string[] }> } {
  const files = patterns.flatMap(expandPattern);
  if (files.length === 0) throw new ControlPlaneError("No files matched the supplied pattern(s)");
  const results = files.map((file) => {
    const { data, body } = readFrontmatter(file);
    const violations: string[] = [];
    const bindings = (data.Canon_Bindings ?? {}) as Record<string, unknown>;
    for (const [key, regex] of Object.entries(PLTEA_KEYS)) {
      const values = Array.isArray(bindings[key]) ? bindings[key] as unknown[] : [];
      for (const value of values) {
        if (typeof value !== "string" || !regex.test(value)) {
          violations.push(`${key}: invalid canonical ID ${String(value)}`);
          continue;
        }
        if (key === "things_t" && /^T:\d{4}-\d{2}-\d{2}/i.test(value)) {
          violations.push(`${key}: T is Thing, not Time; move dates to Temporal_Bounds`);
        }
        if (key === "events_e" && /^E:.*(LLC|INC|CORP|TRUST|SERIES)/i.test(value)) {
          violations.push(`${key}: E is Event, not a legal Person; bind legal actors under P:`);
        }
        if (key === "authorities_a" && /^A:(EXHIBIT|DOC|STATEMENT|INVOICE|LEASE|MEMO|FILE)_/i.test(value)) {
          violations.push(`${key}: ordinary documents are Things (T:), not Authorities (A:)`);
        }
      }
    }
    const temporal = (data.Temporal_Bounds ?? {}) as Record<string, unknown>;
    for (const key of ["effective_from", "effective_until"]) {
      const value = temporal[key];
      if (value !== undefined && value !== null && Number.isNaN(Date.parse(String(value)))) {
        violations.push(`Temporal_Bounds.${key}: invalid ISO-8601 value`);
      }
    }
    if (options.requireWorkflowGate && data.workflow_gate !== options.requireWorkflowGate) {
      violations.push(`workflow_gate: expected ${options.requireWorkflowGate}`);
    }
    if (options.forbidStaticEntities && /(?:persons?|entities?|locations?)\s*:\s*\[[^\]]+\]/i.test(body)) {
      violations.push("body contains a static entity/location list; resolve canonical references at runtime");
    }
    return { file, violations };
  });
  return { valid: results.every((r) => r.violations.length === 0), files: results };
}

async function mintCapability(argv: any): Promise<any> {
  const repoPath = argv.repoPath ?? argv.repo;
  if (!repoPath) throw new ControlPlaneError("--repo-path/--repo is required");
  return controlPlaneRequest("/api/v1/capabilities/mint", {
    endpoint: argv.endpoint,
    method: "POST",
    body: {
      caller_chittyid: argv.callerChittyid,
      tenant_id: argv.tenant,
      operation: argv.op,
      repo_path: repoPath,
      ...(argv.remote ? { remote: argv.remote } : {}),
      ...(argv.ref ? { ref: argv.ref } : {}),
      force_class: argv.forceClass ?? "none",
      ...(argv.confirmationToken ? { confirmation_token: argv.confirmationToken } : {}),
    },
  });
}

export async function introspectCapability(argv: any): Promise<any> {
  const token = String(argv.token ?? "");
  if (!token.startsWith("cap_")) {
    throw new ControlPlaneError("Only opaque cap_* capability references are accepted");
  }
  const repoPath = argv.repoPath ?? argv.repo;
  const result = await controlPlaneRequest<any>("/api/v1/capabilities/introspect", {
    endpoint: argv.endpoint as string,
    method: "POST",
    body: {
      token,
      ...(argv.op ? { operation: argv.op } : {}),
      ...(repoPath ? { repo_path: repoPath } : {}),
      ...(argv.remote ? { remote: argv.remote } : {}),
      ...(argv.ref ? { ref: argv.ref } : {}),
    },
  });
  if (!result.active) {
    throw new ControlPlaneError(
      `Capability is inactive${result.reason ? `: ${result.reason}` : ""}`,
    );
  }
  return result;
}

export async function configDriftCheck(options: { endpoint?: string; folderId: string }): Promise<any> {
  return controlPlaneRequest<any>("/api/v1/config/drift-check", {
    endpoint: options.endpoint ?? DEFAULT_CONFIG_URL,
    method: "POST",
    body: { folder_id: options.folderId },
  });
}

export async function configReconcile(options: {
  endpoint?: string;
  fromDrive: boolean;
  fromGit: boolean;
  sha?: string;
  approval?: string;
}): Promise<any> {
  if (options.fromDrive === options.fromGit) {
    throw new ControlPlaneError("Choose exactly one of --from-drive or --from-git");
  }
  return controlPlaneRequest<any>("/api/v1/config/reconcile", {
    endpoint: options.endpoint ?? DEFAULT_CONFIG_URL,
    method: "POST",
    body: {
      direction: options.fromDrive ? "from-drive" : "from-git",
      sha: options.sha,
      approval: options.approval,
    },
  });
}

export async function authLoginOidcCommand(argv: any): Promise<void> {
  if (!argv.oidc) {
    throw new ControlPlaneError("Only --oidc login is supported by this non-persistent auth command");
  }
  const endpoint = (argv.endpoint as string | undefined) ?? DEFAULT_CONNECT_URL;
  const token = await getGitHubActionsOidcToken(endpoint);
  const claims = decodeJwtClaims(token);
  const exp = typeof claims.exp === "number" ? claims.exp : 0;
  if (exp && exp <= Math.floor(Date.now() / 1000)) {
    throw new ControlPlaneError("GitHub OIDC token is expired");
  }
  emit({
    authenticated: true,
    persistence: "none",
    issuer: claims.iss ?? null,
    audience: claims.aud ?? null,
    repository: claims.repository ?? null,
    actor: claims.actor ?? null,
    ref: claims.ref ?? null,
    expires_at: exp ? new Date(exp * 1000).toISOString() : null,
  }, Boolean(argv.json));
}

export async function authVerifyCustodyCommand(argv: any): Promise<void> {
  const result = await controlPlaneRequest<any>("/api/v1/health/custody-verify", {
    endpoint: (argv.endpoint as string | undefined) ?? DEFAULT_CONNECT_URL,
  });
  if (argv.strict) {
    const ok = result.github_app_id_present === true && result.github_app_pk_valid === true &&
      result.broker_signing_key_custody === "verified" && result.ledger_emission_authority === "verified";
    if (!ok) throw new ControlPlaneError("Custody verification did not satisfy strict closure gate");
  }
  emit(result, Boolean(argv.json));
}

export function registerControlPlaneCommands(cli: any): void {
  cli.command(
    "cap",
    "Opaque ChittyConnect capability operations",
    (y: any) => y
      .command("mint", "Mint one operation-scoped capability", (yy: any) => yy
        .option("endpoint", { type: "string", default: DEFAULT_CONNECT_URL })
        .option("caller-chittyid", { type: "string", demandOption: true })
        .option("tenant", { type: "string", demandOption: true })
        .option("op", { choices: ["read", "commit", "tag", "push"] as const, demandOption: true })
        .option("repo-path", { type: "string" })
        .option("repo", { type: "string" })
        .option("remote", { type: "string" })
        .option("ref", { type: "string" })
        .option("force-class", { choices: ["none", "force", "force_with_lease"] as const, default: "none" })
        .option("confirmation-token", { type: "string" })
        .option("quiet", { type: "boolean", default: false })
        .option("json", { type: "boolean", default: false }), async (argv: any) => {
          const result = await mintCapability(argv);
          const token = result.token ?? result.capability_token;
          if (typeof token !== "string" || !token.startsWith("cap_")) throw new ControlPlaneError("Control plane returned a non-opaque capability token");
          if (argv.quiet) console.log(token);
          else emit({ ...result, token: redactedToken(token), capability_token: undefined }, Boolean(argv.json));
        })
      .command("introspect <token>", "Fail-closed capability introspection", (yy: any) => yy
        .positional("token", { type: "string", demandOption: true })
        .option("endpoint", { type: "string", default: DEFAULT_CONNECT_URL })
        .option("op", { choices: ["read", "commit", "tag", "push"] as const })
        .option("repo-path", { type: "string" })
        .option("repo", { type: "string" })
        .option("remote", { type: "string" })
        .option("ref", { type: "string" })
        .option("json", { type: "boolean", default: false }), async (argv: any) => {
          const result = await introspectCapability(argv);
          emit(result, Boolean(argv.json));
        })
      .demandCommand(1),
    () => cli.showHelp(),
  );

  cli.command(
    "canon",
    "ChittyCanon ontology validation and resolution",
    (y: any) => y
      .command("validate <files..>", "Validate local instruction frontmatter against P/L/T/E/A", (yy: any) => yy
        .positional("files", { type: "string", array: true, demandOption: true })
        .option("strict-pltea", { type: "boolean", default: true })
        .option("forbid-static-entities", { type: "boolean", default: false })
        .option("require-workflow-gate", { type: "string" })
        .option("json", { type: "boolean", default: false }), async (argv: any) => {
          const result = validatePlteaFiles(argv.files as string[], {
            requireWorkflowGate: argv.requireWorkflowGate as string | undefined,
            forbidStaticEntities: Boolean(argv.forbidStaticEntities),
          });
          emit(result, Boolean(argv.json));
          if (!result.valid) process.exitCode = 1;
        })
      .command("resolve", "Resolve canonical graph references", (yy: any) => yy
        .option("endpoint", { type: "string", default: DEFAULT_CANON_URL })
        .option("scope", { type: "string" })
        .option("from-frontmatter", { type: "string" })
        .option("fail-on-unresolved", { type: "boolean", default: false })
        .option("fail-on-conflict", { type: "boolean", default: false })
        .option("json", { type: "boolean", default: false }), async (argv: any) => {
          let body: Record<string, unknown> = {};
          if (argv.scope) body.scope = argv.scope;
          if (argv.fromFrontmatter) {
            const files = expandPattern(argv.fromFrontmatter as string);
            body.bindings = files.map((file) => ({ file, Canon_Bindings: readFrontmatter(file).data.Canon_Bindings ?? {} }));
          }
          const result = await controlPlaneRequest<any>("/api/v1/graph/resolve", {
            endpoint: argv.endpoint as string,
            method: "POST",
            body,
          });
          const unresolved = result.resolution_diagnostics?.unresolved_queries?.length ?? 0;
          const conflicts = result.resolution_diagnostics?.conflicts?.length ?? 0;
          emit(result, Boolean(argv.json));
          if ((argv.failOnUnresolved && unresolved > 0) || (argv.failOnConflict && conflicts > 0)) process.exitCode = 1;
        })
      .demandCommand(1),
    () => cli.showHelp(),
  );

  cli.command(
    "pr",
    "Governed ChittyConnect PR gate operations",
    (y: any) => y
      .command("trace", "Emit Canon/ontology trace for a PR", (yy: any) => yy
        .option("endpoint", { type: "string", default: DEFAULT_CONNECT_URL })
        .option("repo", { type: "string", demandOption: true })
        .option("pr", { type: "number", demandOption: true })
        .option("snapshot", { type: "string" })
        .option("json", { type: "boolean", default: false }), async (argv: any) => {
          const snapshot = argv.snapshot ? JSON.parse(fs.readFileSync(argv.snapshot as string, "utf8")) : undefined;
          const result = await controlPlaneRequest<any>("/api/v1/pr/trace", { endpoint: argv.endpoint as string, method: "POST", body: { repo: argv.repo, pr_number: argv.pr, snapshot } });
          emit(result, Boolean(argv.json));
        })
      .command("approve", "Approve a PR through the governed gate", (yy: any) => yy
        .option("endpoint", { type: "string", default: DEFAULT_CONNECT_URL })
        .option("repo", { type: "string", demandOption: true })
        .option("pr", { type: "number", demandOption: true })
        .option("reason", { type: "string", demandOption: true })
        .option("json", { type: "boolean", default: false }), async (argv: any) => {
          const result = await controlPlaneRequest<any>("/api/v1/pr/approve", { endpoint: argv.endpoint as string, method: "POST", body: { repo: argv.repo, pr_number: argv.pr, reason: argv.reason } });
          emit(result, Boolean(argv.json));
        })
      .command("hold", "Hold a PR through the governed gate", (yy: any) => yy
        .option("endpoint", { type: "string", default: DEFAULT_CONNECT_URL })
        .option("repo", { type: "string", demandOption: true })
        .option("pr", { type: "number", demandOption: true })
        .option("json", { type: "boolean", default: false }), async (argv: any) => {
          const result = await controlPlaneRequest<any>("/api/v1/pr/hold", { endpoint: argv.endpoint as string, method: "POST", body: { repo: argv.repo, pr_number: argv.pr } });
          emit(result, Boolean(argv.json));
        })
      .demandCommand(1),
    () => cli.showHelp(),
  );

  cli.command(
    "git",
    "Governed Git operations through ChittyOS capability brokers",
    (y: any) => y.command("stage-pr", "Stage a capability-gated PR transaction", (yy: any) => yy
      .option("caller-chittyid", { type: "string", demandOption: true })
      .option("tenant", { type: "string", demandOption: true })
      .option("repo-path", { type: "string", demandOption: true })
      .option("remote", { type: "string", default: "origin" })
      .option("branch", { type: "string", demandOption: true })
      .option("file", { type: "string", demandOption: true })
      .option("content", { type: "string" })
      .option("message", { type: "string", demandOption: true })
      .option("title", { type: "string", demandOption: true })
      .option("json", { type: "boolean", default: false }), async () => {
        throw new ControlPlaneError(
          "chittyagent-git is currently chartered read-only; stage-pr is blocked until ChittyEntity #789 lands an audited write projection",
        );
      }).demandCommand(1),
    () => cli.showHelp(),
  );

  // ChittyConfig uses the existing top-level `config` command. Its governed
  // subcommands are registered by src/index.ts so the interactive `can config`
  // menu remains backward compatible.
}
