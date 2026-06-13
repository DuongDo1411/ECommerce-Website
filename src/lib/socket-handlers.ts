import connectDB from "@/lib/connectDB";
import { findConversationForUser } from "@/lib/chat";
import { getSocketUser } from "@/lib/socket-auth";
import type { Server, Socket } from "socket.io";

async function canAccessConversation(socket: Socket, conversationId: unknown) {
  if (typeof conversationId !== "string") return false;
  const user = socket.data.user as { id?: string } | undefined;
  if (!user?.id) return false;

  await connectDB();
  const conversation = await findConversationForUser(conversationId, user.id);
  return Boolean(conversation);
}

function isInConversationRoom(socket: Socket, conversationId: unknown) {
  return (
    typeof conversationId === "string" &&
    socket.rooms.has(`conversation:${conversationId}`)
  );
}

export function registerSocketHandlers(io: Server) {
  io.on("connection", async (socket) => {
    const user = await getSocketUser(socket);

    if (!user) {
      socket.disconnect(true);
      return;
    }

    socket.data.user = user;
    socket.join(`user:${user.id}`);

    socket.on("join_conversation", async ({ conversationId }) => {
      if (await canAccessConversation(socket, conversationId)) {
        socket.join(`conversation:${conversationId}`);
      }
    });

    socket.on("leave_conversation", ({ conversationId }) => {
      if (typeof conversationId === "string") {
        socket.leave(`conversation:${conversationId}`);
      }
    });

    socket.on("typing_start", ({ conversationId }) => {
      if (isInConversationRoom(socket, conversationId)) {
        socket.to(`conversation:${conversationId}`).emit("typing_start", {
          conversationId,
          userId: user.id,
        });
      }
    });

    socket.on("typing_stop", ({ conversationId }) => {
      if (isInConversationRoom(socket, conversationId)) {
        socket.to(`conversation:${conversationId}`).emit("typing_stop", {
          conversationId,
          userId: user.id,
        });
      }
    });
  });
}
