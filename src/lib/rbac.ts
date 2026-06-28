import { auth } from "@/auth";
import connectDB from "@/lib/connectDB";
import { homeForRole } from "@/lib/roleRoutes";
import User, { IUser } from "@/model/user.model";
import type { HydratedDocument } from "mongoose";
import type { Session } from "next-auth";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";

export const ROLES = ["user", "vendor", "admin"] as const;
export type Role = (typeof ROLES)[number];

export type AuthContext = {
  session: Session;
  user: HydratedDocument<IUser>;
};

type RequireRoleOptions =
  | { mode: "api" }
  | { mode?: "page"; redirectTo?: string };

const isRole = (role: unknown): role is Role =>
  typeof role === "string" && ROLES.includes(role as Role);

// Re-exported from the client-safe helper so existing `@/lib/rbac` importers keep working.
export { homeForRole };

async function getAuthContext(): Promise<AuthContext | null> {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return null;
  }

  await connectDB();
  const user = await User.findById(userId);

  if (!user) {
    return null;
  }

  return { session, user };
}

export async function getOptionalUser(): Promise<AuthContext | null> {
  return getAuthContext();
}

export async function requireRole(
  allowedRoles: Role[],
  options: { mode: "api" },
): Promise<AuthContext | NextResponse>;
export async function requireRole(
  allowedRoles: Role[],
  options?: { mode?: "page"; redirectTo?: string },
): Promise<AuthContext>;
export async function requireRole(
  allowedRoles: Role[],
  options: RequireRoleOptions = {},
): Promise<AuthContext | NextResponse> {
  const context = await getAuthContext();

  if (!context) {
    if (options.mode === "api") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    redirect("/login");
  }

  const role = context.user.role;

  if (!isRole(role) || !allowedRoles.includes(role)) {
    if (options.mode === "api") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    redirect(options.redirectTo ?? homeForRole(role));
  }

  return context;
}
