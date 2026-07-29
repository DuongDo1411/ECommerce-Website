import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import Google from "next-auth/providers/google";
import { headers } from "next/headers";
import { authorizePortalCredentials } from "./lib/auth/portalCredentials";
import { consumeGrant } from "./lib/auth/loginChallenge";
import { prepareGoogleUser } from "./lib/auth/googleUser";
import { applySessionState } from "./lib/auth/sessionToken";
import { hashDeviceId, readDeviceIdFromRequest } from "./lib/security/device";
import { recordLoginActivity } from "./lib/security/loginActivity";
import { clientIp } from "./lib/security/rateLimit";
import { credentialProviderForRole, type LoginRole } from "./lib/roleRoutes";

/**
 * User/Vendor portal: the form never sends the password to NextAuth. It first
 * runs the `/api/auth/login/initiate` → `verify-otp` handshake and hands us a
 * one-time `loginGrant`, which we trade for a session here. The grant is bound
 * to the device cookie so 2FA/trusted-device policy is enforced server-side.
 */
function portalGrantCredentials(role: LoginRole) {
  return Credentials({
    id: credentialProviderForRole(role),
    credentials: {
      loginGrant: { label: "Login grant", type: "text" },
    },
    authorize: async (credentials, request) => {
      const rawGrant = credentials?.loginGrant;
      if (typeof rawGrant !== "string") return null;
      const deviceId = readDeviceIdFromRequest(request);
      if (!deviceId) return null;
      return consumeGrant({
        rawGrant,
        expectedRole: role,
        deviceIdHash: hashDeviceId(deviceId),
        userAgent: request.headers.get("user-agent"),
      });
    },
  });
}

/**
 * Admin portal: plain email/password, no OTP / 2FA / trusted-device. Admin is
 * intentionally excluded from the 2FA programme. The allowed role is baked in
 * server-side so a form can never ask to be authorised as a different role.
 */
function portalCredentials(role: LoginRole) {
  return Credentials({
    id: credentialProviderForRole(role),
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    authorize: (credentials, request) =>
      authorizePortalCredentials(credentials, role, request),
  });
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    portalGrantCredentials("user"),
    portalGrantCredentials("vendor"),
    portalCredentials("admin"),
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
  ],
  callbacks:{
    async signIn({ user, account }) {
      if (account?.provider === "google") {
        // Google is a user-only doorway; existing Vendor/Admin accounts are
        // bounced with a code the login page turns into a friendly toast.
        const allowed = await prepareGoogleUser(user);
        if (!allowed) {
          return "/login?error=RolePortalMismatch";
        }
        // Audit the accepted Google sign-in (best-effort; never blocks login).
        try {
          const h = await headers();
          recordLoginActivity({
            userId: String(user.id),
            success: true,
            ip: clientIp(h as unknown as Headers) ?? "unknown",
            userAgent: h.get("user-agent"),
            deviceIdHash: "",
          });
        } catch {
          // headers() unavailable or logging failed — ignore.
        }
      }
      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      // Refreshes email/name/role from the DB and enforces sessionVersion
      // revocation. Returning null (stale/deleted/wrong version) drops the
      // session — Auth.js reads that as "no session".
      return applySessionState(token, Boolean(user));
    },
    session({session , token}){
        if(session.user){
            session.user.id = token.id as string;
            session.user.email = token.email as string;
            session.user.name = token.name as string;
            session.user.role = token.role as string;
        }
        return session;
    }
  },
  pages:{
    signIn:"/login",
    error:"/login"
  },
  session:{
    strategy: "jwt",
    maxAge: 10 * 24 * 60 * 60
  },
  secret:process.env.AUTH_SECRET
})
