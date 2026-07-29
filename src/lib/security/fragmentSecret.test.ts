import { describe, expect, it } from "vitest";

import {
  resolveFragmentSecret,
  retainFragmentSecret,
  retainSecret,
} from "./fragmentSecret";

const SECRET = "a".repeat(64);

describe("retainFragmentSecret", () => {
  it("retains the first captured value when Strict Mode runs the effect again", () => {
    const firstRun = retainFragmentSecret(
      "",
      `#challenge=${SECRET}`,
      "challenge",
    );
    const secondRun = retainFragmentSecret(firstRun, "", "challenge");

    expect(secondRun).toBe(SECRET);
  });

  it("does not accept malformed fragment secrets", () => {
    expect(
      retainFragmentSecret("", "#token=not-a-valid-token", "token"),
    ).toBe("");
  });

  it("can recover a valid secret saved by the same browser tab", () => {
    expect(retainSecret("", SECRET)).toBe(SECRET);
    expect(retainSecret(SECRET, "invalid")).toBe(SECRET);
  });

  it("prefers a new URL fragment over a stale tab value", () => {
    const newer = "b".repeat(64);
    expect(
      resolveFragmentSecret("", `#token=${newer}`, "token", SECRET),
    ).toBe(newer);
  });
});
