import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchChittyCanonDbUrl } from "../src/commands/hook-handlers.js";

describe("context authentication ChittyConnect credential routing", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the configured chittyconnect remote instead of requiring an env token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, value: "postgres://canon" }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchChittyCanonDbUrl({
      remotes: {
        connect: {
          type: "chittyconnect",
          baseUrl: "https://connect.example",
          apiToken: "remote-token"
        }
      }
    } as any);

    expect(result).toBe("postgres://canon");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://connect.example/api/credentials/infrastructure/neon/chittycanon_db_url",
      expect.objectContaining({
        headers: { "X-ChittyOS-API-Key": "remote-token" }
      })
    );
  });

  it("fails closed without a configured or environment credential", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchChittyCanonDbUrl({ remotes: {} } as any);

    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
