import type { NextAuthOptions } from "next-auth";
import GithubProvider from "next-auth/providers/github";

const adminEmail = process.env.VELOUR_ADMIN_EMAIL;
if (!adminEmail) throw new Error("VELOUR_ADMIN_EMAIL is not set");

export const authOptions: NextAuthOptions = {
  providers: [
    GithubProvider({
      clientId: process.env.GITHUB_CLIENT_ID ?? "",
      clientSecret: process.env.GITHUB_CLIENT_SECRET ?? "",
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      // Only the configured admin email may sign in.
      return user.email === adminEmail;
    },
  },
};
