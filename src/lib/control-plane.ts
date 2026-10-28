import { loadConfig, type ChittyConnectRemote } from "./config.js";

export const DEFAULT_CONNECT_URL = "https://connect.chitty.cc";
export const DEFAULT_CANON_URL = "https://canon.chitty.cc";
export const DEFAULT_CONFIG_URL = "https://config.chitty.cc";

export class ControlPlaneError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "ControlPlaneError";
  }
}

function base64UrlDecode(input: string): string {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, "base64").toString("utf8");
}

export function decodeJwtClaims(token: string): Record<string, unknown> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new ControlPlaneError("OIDC token is not a JWT");
  try {
    return JSON.parse(base64UrlDecode(parts[1])) as Record<string, unknown>;
  } catch {
    throw new ControlPlaneError("OIDC token payload is not valid JSON");
  }
}

export async function getGitHubActionsOidcToken(audience = DEFAULT_CONNECT_URL): Promise<string> {
  const requestUrl = process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
  const requestToken = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if (!requestUrl || !requestToken) {
    throw new ControlPlaneError(
      "GitHub Actions OIDC environment is unavailable; workflow must grant permissions.id-token=write",
    );
  }
  const separator = requestUrl.includes("?") ? "&" : "?";
  const response = await fetch(`${requestUrl}${separator}audience=${encodeURIComponent(audience)}`, {
    headers: { Authorization: `bearer ${requestToken}` },
  });
  if (!response.ok) {
    throw new ControlPlaneError(`GitHub OIDC token request failed (${response.status})`, response.status);
  }
  const body = (await response.json()) as { value?: string };
  if (!body.value) throw new ControlPlaneError("GitHub OIDC response did not contain a token");
  return body.value;
}

export async function resolveControlPlaneToken(endpoint = DEFAULT_CONNECT_URL): Promise<string> {
  if (process.env.ACTIONS_ID_TOKEN_REQUEST_URL && process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN) {
    return getGitHubActionsOidcToken(endpoint);
  }

  const envToken =
    process.env.CHITTY_AUTH_TOKEN ||
    process.env.CHITTY_TOKEN ||
    process.env.CHITTY_API_TOKEN ||
    process.env.CHITTYCONNECT_TOKEN;
  if (envToken) return envToken;

  const config = loadConfig();
  const remote = config.remotes.connect as ChittyConnectRemote | undefined;
  if (remote?.type === "chittyconnect" && remote.apiToken) return remote.apiToken;

  throw new ControlPlaneError(
    "No ChittyOS control-plane identity available. In GitHub Actions grant id-token: write; locally configure ChittyConnect or set CHITTY_AUTH_TOKEN.",
  );
}

export interface ControlPlaneRequestOptions {
  endpoint?: string;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  token?: string;
  auth?: boolean;
}

export async function controlPlaneRequest<T>(
  path: string,
  options: ControlPlaneRequestOptions = {},
): Promise<T> {
  const endpoint = (options.endpoint ?? DEFAULT_CONNECT_URL).replace(/\/$/, "");
  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.auth !== false) {
    const token = options.token ?? (await resolveControlPlaneToken(endpoint));
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${endpoint}${path}`, {
    method: options.method ?? (options.body === undefined ? "GET" : "POST"),
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = { detail: text.slice(0, 1000) }; }
  }
  if (!response.ok) {
    const obj = data && typeof data === "object" ? data as Record<string, unknown> : {};
    const error = obj.error;
    const code = typeof error === "string"
      ? error
      : error && typeof error === "object" && typeof (error as Record<string, unknown>).code === "string"
        ? String((error as Record<string, unknown>).code)
        : undefined;
    throw new ControlPlaneError(
      `ChittyOS control-plane request failed (${response.status})${code ? `: ${code}` : ""}`,
      response.status,
      code,
    );
  }
  return data as T;
}

export function redactedToken(token: string): string {
  if (token.length < 10) return "[redacted]";
  return `${token.slice(0, 4)}…${token.slice(-4)}`;
}
