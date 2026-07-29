import { describe, expect, it } from "vitest";

import {
  canonicalOrigin,
  configuredOrigins,
  websocketOrigin,
} from "./origins";

describe("configuredOrigins", () => {
  it("normalizes and de-duplicates deployment-owned origins", () => {
    expect(
      configuredOrigins({
        NODE_ENV: "production",
        AUTH_URL: "https://shop.example/path",
        ALLOWED_ORIGINS:
          "https://admin.example/, https://shop.example, javascript:alert(1), *",
      }),
    ).toEqual(["https://shop.example", "https://admin.example"]);
  });

  it("only falls back to localhost outside production", () => {
    expect(configuredOrigins({ NODE_ENV: "production" }, 4444)).toEqual([]);
    expect(configuredOrigins({ NODE_ENV: "development" }, 4444)).toEqual([
      "http://localhost:4444",
      "http://127.0.0.1:4444",
    ]);
  });

  it("rejects cleartext non-loopback origins in production", () => {
    expect(
      configuredOrigins({
        NODE_ENV: "production",
        AUTH_URL: "http://shop.example",
        ALLOWED_ORIGINS: "http://admin.example, http://localhost:3107",
      }),
    ).toEqual(["http://localhost:3107"]);
    expect(
      canonicalOrigin({
        NODE_ENV: "production",
        AUTH_URL: "http://shop.example",
      }),
    ).toBeNull();
  });

  it("derives canonical and websocket origins without paths", () => {
    expect(
      canonicalOrigin({
        NODE_ENV: "production",
        AUTH_URL: "https://shop.example/auth",
      }),
    ).toBe("https://shop.example");
    expect(websocketOrigin("https://shop.example")).toBe(
      "wss://shop.example",
    );
  });
});
