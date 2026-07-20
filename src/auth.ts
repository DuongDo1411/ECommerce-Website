import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import Google from "next-auth/providers/google";
import connectDB from "./lib/connectDB";
import User from "./model/user.model";
import { authorizePortalCredentials } from "./lib/auth/portalCredentials";
import { prepareGoogleUser } from "./lib/auth/googleUser";
import { credentialProviderForRole, type LoginRole } from "./lib/roleRoutes";

 
/**
 * Builds a Credentials provider locked to a single role. The allowed role is
 * baked into the server config here — it is never read from the client — so a
 * form can never ask to be authorised as a different role.
 */
function portalCredentials(role: LoginRole) {
  return Credentials({
    id: credentialProviderForRole(role),
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    authorize: (credentials) => authorizePortalCredentials(credentials, role),
  });
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    portalCredentials("user"),
    portalCredentials("vendor"),
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
      }
      return true;
    },
    async jwt({token , user}){
        if(user){
            token.id = user.id;
            token.email = user.email;
            token.name = user.name;
            token.role = user.role;
        }
        if (token.id) {
          await connectDB();
          const freshUser = await User.findById(token.id).select(
            "email name role",
          );

          if (freshUser) {
            token.email = freshUser.email;
            token.name = freshUser.name;
            token.role = freshUser.role;
          }
        }
        return token;
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
