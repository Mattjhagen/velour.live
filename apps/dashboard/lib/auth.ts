import type { NextAuthOptions } from "next-auth";
import GithubProvider from "next-auth/providers/github";

export const authOptions: NextAuthOptions = {
  providers: [
    GithubProvider({
      clientId: process.env.GITHUB_CLIENT_ID ?? "",
      clientSecret: process.env.GITHUB_CLIENT_SECRET ?? "",
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      const adminEmail = process.env.VELOUR_ADMIN_EMAIL;
      // Deny all sign-ins if admin email is not configured.
      if (!adminEmail) return false;
      return user.email === adminEmail;
    },
  },
};
