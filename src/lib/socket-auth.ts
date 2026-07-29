import { getToken } from "next-auth/jwt";
import type { Socket } from "socket.io";

import connectDB from "@/lib/connectDB";
import User from "@/model/user.model";

export interface SocketUser {
  id: string;
  role?: string;
  email?: string;
  name?: string;
}

/**
 * Authenticates a socket from its Auth.js JWT cookie and re-validates it against
 * the database. A token whose `sessionVersion` no longer matches (password
 * change, 2FA toggle, logout-all) or whose account was deleted is rejected, and
 * the returned claims are always read fresh from the DB — never trusted from the
 * token — so a role change takes effect on the next connection.
 */
export async function getSocketUser(socket: Socket): Promise<SocketUser | null> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return null;

  const token = await getToken({
    req: {
      headers: {
        cookie: socket.request.headers.cookie ?? "",
        authorization: socket.request.headers.authorization ?? "",
      },
    },
    secret,
    secureCookie: process.env.NODE_ENV === "production",
  });

  const id = typeof token?.id === "string" ? token.id : token?.sub;
  if (!id) return null;
  // A token minted before session versioning has no stamp to validate against.
  if (!Number.isInteger(token?.sessionVersion)) return null;

  await connectDB();
  const user = await User.findById(id)
    .select("name email role sessionVersion")
    .lean();
  if (!user) return null;
  if (user.sessionVersion !== token?.sessionVersion) return null;

  return {
    id,
    role: typeof user.role === "string" ? user.role : undefined,
    email: typeof user.email === "string" ? user.email : undefined,
    name: typeof user.name === "string" ? user.name : undefined,
  };
}
