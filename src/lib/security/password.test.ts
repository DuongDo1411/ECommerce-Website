import { createHash } from "crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

import { validatePasswordPolicy } from "./password";

// A strong, ASCII passphrase reused across the HIBP tests.
const STRONG = "unbroken-strong-passphrase";

function stubFetchRange(body: string, ok = true) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok, text: async () => body })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("validatePasswordPolicy", () => {
  it("rejects passwords shorter than 12 code points", async () => {
    stubFetchRange("");
    expect((await validatePasswordPolicy("short")).ok).toBe(false);
  });

  it("rejects passwords longer than 64 code points", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, text: async () => "" }));
    vi.stubGlobal("fetch", fetchMock);
    expect((await validatePasswordPolicy("a".repeat(65))).ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a huge password before breach lookup", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, text: async () => "" }));
    vi.stubGlobal("fetch", fetchMock);
    expect((await validatePasswordPolicy("a".repeat(1_000_000))).ok).toBe(
      false,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects passwords over 72 UTF-8 bytes even within 64 code points", async () => {
    stubFetchRange("");
    // 25 emoji = 25 code points but 100 bytes.
    expect((await validatePasswordPolicy("😀".repeat(25))).ok).toBe(false);
  });

  it("rejects a common password from the local blocklist", async () => {
    stubFetchRange("");
    expect((await validatePasswordPolicy("passwordpassword")).ok).toBe(false);
  });

  it("rejects a password present in the HIBP range", async () => {
    const suffix = createHash("sha1")
      .update(STRONG)
      .digest("hex")
      .toUpperCase()
      .slice(5);
    stubFetchRange(`${suffix}:99`);
    expect((await validatePasswordPolicy(STRONG)).ok).toBe(false);
  });

  it("accepts a strong password not present in the HIBP range", async () => {
    stubFetchRange("0000000000000000000000000000000000000:1");
    expect((await validatePasswordPolicy(STRONG)).ok).toBe(true);
  });

  it("fails open (accepts) when the HIBP lookup errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );
    expect((await validatePasswordPolicy(STRONG)).ok).toBe(true);
  });
});
