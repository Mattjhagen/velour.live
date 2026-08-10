import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Nav } from "@/components/Nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "Velour",
  description: "Self-hosted deployment platform",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);

  if (!session) {
    return (
      <html lang="en">
        <body className="bg-zinc-950">{children}</body>
      </html>
    );
  }

  return (
    <html lang="en">
      <body className="flex h-screen overflow-hidden bg-zinc-50">
        <Nav session={session} />
        <main className="flex-1 overflow-auto">{children}</main>
      </body>
    </html>
  );
}
