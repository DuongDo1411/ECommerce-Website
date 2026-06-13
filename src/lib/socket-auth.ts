import { getToken } from "next-auth/jwt";
import type { Socket } from "socket.io";

export interface SocketUser {
  id: string;
  role?: string;
  email?: string;
  name?: string;
}

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

  return {
    id,
    role: typeof token?.role === "string" ? token.role : undefined,
    email: typeof token?.email === "string" ? token.email : undefined,
    name: typeof token?.name === "string" ? token.name : undefined,
  };
}
