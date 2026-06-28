import type { Server } from "socket.io";

// Store the Socket.IO server on globalThis so the instance is shared across
// module graphs. In Next 16 the custom server (server.ts) and API route handlers
// are bundled separately; a module-local `let io` would be a different binding in
// each bundle, leaving getIO() null inside route handlers (chat appeared non-realtime).

export function setIO(server: Server) {
  globalThis.chatSocketIO = server;
}

export function getIO() {
  return globalThis.chatSocketIO ?? null;
}
