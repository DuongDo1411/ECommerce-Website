import { afterEach, describe, expect, it, vi } from "vitest";
import type { Server } from "socket.io";

const mockServer = { id: "mock-io" } as unknown as Server;

afterEach(() => {
  globalThis.chatSocketIO = null;
  vi.resetModules();
});

describe("socket-server", () => {
  it("getIO returns null before any server is registered", async () => {
    const { getIO } = await import("./socket-server");
    expect(getIO()).toBeNull();
  });

  it("getIO returns the instance registered via setIO", async () => {
    const { setIO, getIO } = await import("./socket-server");
    setIO(mockServer);
    expect(getIO()).toBe(mockServer);
  });

  it("shares the instance across separate module loads (globalThis)", async () => {
    // Simulates server.ts and an API route handler being in different bundles:
    // the registration done in one module load must be visible after a reload.
    const first = await import("./socket-server");
    first.setIO(mockServer);

    vi.resetModules();
    const second = await import("./socket-server");
    expect(second.getIO()).toBe(mockServer);
  });
});
