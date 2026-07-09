/**
 * ChittyClaw AI Gateway routing helper.
 *
 * Repoints chittycan's per-provider LLM clients (Anthropic, OpenAI, ...) at the
 * Cloudflare AI Gateway "chittyclaw" so that non-Workers-AI provider spend is
 * captured by the gateway logs and lands in chittyops.cost_ledger via the
 * ChittyComptroller poll. Without this, provider calls go direct to
 * api.anthropic.com / api.openai.com and are invisible to the Comptroller.
 *
 * Design (option (a) per-provider gateway URLs, not the OpenAI-compat endpoint):
 * each provider client already appends its provider-native path (`/messages`,
 * `/chat/completions`) to its baseUrl, so we only have to swap the host+prefix.
 * The compat endpoint would force rewriting every request body into OpenAI chat
 * format — materially more invasive for no benefit here.
 *
 * IMPORTANT — the per-provider URL suffix is NOT uniform:
 *   - OpenAI:    gateway baseUrl = .../chittyclaw/openai        (no /v1)
 *                + client endpoint `/chat/completions`
 *                => .../chittyclaw/openai/chat/completions  ✓
 *   - Anthropic: gateway baseUrl = .../chittyclaw/anthropic/v1 (KEEPS /v1)
 *                + client endpoint `/messages`
 *                => .../chittyclaw/anthropic/v1/messages     ✓
 * (verified against Cloudflare AI Gateway docs, 2026-06)
 */

/** Cloudflare account that owns the chittyclaw gateway. */
export const CHITTYCLAW_ACCOUNT_ID = "0bc21e3a5a9de1a4cc843be9c3e98121";
export const CHITTYCLAW_GATEWAY_ID = "chittyclaw";

const GATEWAY_ROOT = `https://gateway.ai.cloudflare.com/v1/${CHITTYCLAW_ACCOUNT_ID}/${CHITTYCLAW_GATEWAY_ID}`;

/** Host fragment used to detect whether a resolved baseUrl is the CF gateway. */
const GATEWAY_HOST = "gateway.ai.cloudflare.com";

/**
 * Per-provider gateway baseUrls. The suffix is provider-specific so that
 * appending each client's provider-native endpoint yields the correct path.
 */
export const CHITTYCLAW_PROVIDER_BASE_URLS = {
  anthropic: `${GATEWAY_ROOT}/anthropic/v1`,
  openai: `${GATEWAY_ROOT}/openai`,
} as const;

export type ChittyClawProvider = keyof typeof CHITTYCLAW_PROVIDER_BASE_URLS;

/** True when the resolved baseUrl points at the Cloudflare AI Gateway. */
export function isGatewayUrl(baseUrl: string): boolean {
  return baseUrl.includes(GATEWAY_HOST);
}

/**
 * Resolve the CF AI Gateway authorization token without hardcoding it.
 * Order: explicit option -> env (CF_AIG_TOKEN, matching chittyagent-ai's name,
 * then CF_ISSUED_AIGATEWAY_TOKEN as the chittysecrets field alias).
 */
export function resolveCfAigToken(explicit?: string): string | undefined {
  return (
    explicit ||
    process.env.CF_AIG_TOKEN ||
    process.env.CF_ISSUED_AIGATEWAY_TOKEN ||
    undefined
  );
}

/**
 * Build the `cf-aig-authorization` header — but ONLY when the request actually
 * targets the gateway. If a caller passed a non-gateway baseUrl override, we
 * must not leak the gateway token to a direct-provider endpoint.
 */
export function gatewayAuthHeaders(
  resolvedBaseUrl: string,
  cfAigToken?: string,
): Record<string, string> {
  if (!isGatewayUrl(resolvedBaseUrl)) return {};
  const token = resolveCfAigToken(cfAigToken);
  if (!token) return {};
  const value = token.startsWith("Bearer ") ? token : `Bearer ${token}`;
  return { "cf-aig-authorization": value };
}
