import type { Connection } from "mongoose";
import type { Server as SocketIOServer } from "socket.io";

declare global {
  var mongoose: {
    conn: Connection | null;
    promise: Promise<Connection> | null;
  };
  // Shared Socket.IO server instance (see src/lib/socket-server.ts).
  var chatSocketIO: SocketIOServer | null | undefined;
}

export {}
