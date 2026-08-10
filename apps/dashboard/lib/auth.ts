import type { NextAuthOptions } from "next-auth";
import GithubProvider from "next-auth/providers/github";
import { getDb } from "@/lib/db";
import { users } from "@velour/db";

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
      if (!adminEmail) return false;
      return user.email === adminEmail;
    },
    async jwt({ token, account, profile }) {
      if (account && profile && token.email) {
        const githubId = String((profile as { id: number }).id);
        const db = getDb();
        const [row] = await db
          .insert(users)
          .values({ githubId, email: token.email, name: token.name ?? null })
          .onConflictDoUpdate({
            target: users.githubId,
            set: { name: token.name ?? null },
          })
          .returning({ id: users.id });
        token.dbUserId = row.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.dbUserId) session.user.id = token.dbUserId;
      return session;
    },
  },
};
