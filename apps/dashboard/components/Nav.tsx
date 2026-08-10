"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import type { Session } from "next-auth";

function NavItem({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(href + "/");
  return (
    <Link
      href={href}
      className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
        active
          ? "bg-white/10 text-white"
          : "text-zinc-400 hover:bg-white/5 hover:text-white"
      }`}
    >
      {label}
    </Link>
  );
}

export function Nav({ session }: { session: Session | null }) {
  return (
    <aside className="flex h-screen w-56 flex-col bg-zinc-950 px-3 py-4 flex-shrink-0">
      {/* Brand */}
      <div className="mb-6 px-3">
        <span className="text-lg font-semibold tracking-tight text-violet-400">Velour</span>
        <span className="ml-1 text-xs text-zinc-500">PaaS</span>
      </div>

      {/* Nav items */}
      <nav className="flex-1 space-y-0.5">
        <NavItem href="/projects" label="Projects" />
      </nav>

      {/* User footer */}
      {session?.user && (
        <div className="border-t border-white/10 pt-3">
          <p className="truncate px-3 text-xs text-zinc-500">{session.user.email}</p>
          <button
            onClick={() => signOut({ callbackUrl: "/" })}
            className="mt-1 w-full rounded-md px-3 py-2 text-left text-sm text-zinc-400 transition-colors hover:bg-white/5 hover:text-white"
          >
            Sign out
          </button>
        </div>
      )}
    </aside>
  );
}
