"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function TabLink({ href, label, exact }: { href: string; label: string; exact?: boolean }) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");
  return (
    <Link
      href={href}
      className={`border-b-2 px-4 pb-3 text-sm font-medium transition-colors ${
        active
          ? "border-violet-600 text-violet-600"
          : "border-transparent text-zinc-500 hover:text-zinc-800"
      }`}
    >
      {label}
    </Link>
  );
}
