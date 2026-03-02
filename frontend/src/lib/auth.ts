import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

type UserWithToken = { accessToken?: string; isAdmin?: boolean; roles?: string[] };
type SessionWithToken = { accessToken?: string; user: { isAdmin?: boolean; roles?: string[] } };

const API_URL = process.env.API_URL_INTERNAL || "http://api:8000";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        try {
          const res = await fetch(`${API_URL}/api/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: credentials.email,
              password: credentials.password,
            }),
          });
          if (!res.ok) return null;
          const data = await res.json();

          const payload = JSON.parse(
            Buffer.from(data.access_token.split(".")[1], "base64").toString()
          );

          return {
            id: payload.sub,
            email: payload.email,
            name: payload.name,
            accessToken: data.access_token,
            isAdmin: payload.is_admin,
            roles: payload.roles || [],
          };
        } catch {
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.accessToken = (user as UserWithToken).accessToken;
        token.isAdmin = (user as UserWithToken).isAdmin;
        token.roles = (user as UserWithToken).roles;
      }
      return token;
    },
    async session({ session, token }) {
      (session as SessionWithToken).accessToken = token.accessToken as string | undefined;
      (session as SessionWithToken).user.isAdmin = token.isAdmin as boolean | undefined;
      (session as SessionWithToken).user.roles = token.roles as string[] | undefined;
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
};
