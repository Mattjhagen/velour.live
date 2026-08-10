import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import Link from "next/link";

export default async function HomePage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    return (
      <main>
        <h1>Velour</h1>
        <p>Self-hosted deployment platform.</p>
        <Link href="/api/auth/signin">Sign in with GitHub</Link>
      </main>
    );
  }

  return (
    <main>
      <h1>Velour</h1>
      <p>Signed in as {session.user?.email}</p>
      <p>Dashboard coming in Step 2.</p>
      <Link href="/api/auth/signout">Sign out</Link>
    </main>
  );
}
