"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "@/lib/auth-client";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/dashboard/properties", label: "Properties" },
  { href: "/dashboard/inspections", label: "Inspections" },
  { href: "/dashboard/floor-plans", label: "Floor Plans" },
  { href: "/dashboard/tenants", label: "Tenants & Landlords" },
  { href: "/dashboard/compliance", label: "Compliance" },
  { href: "/dashboard/settings", label: "Settings" },
];

export default function Sidebar({ email, role }: { email: string; role: string }) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <aside className="hidden md:flex w-60 shrink-0 bg-ink text-white flex-col justify-between min-h-screen sticky top-0">
      <div>
        <div className="px-6 py-6">
          <span className="font-display font-700 text-lg">ProptMate</span>
        </div>
        <nav className="mt-4 flex flex-col gap-1 px-3">
          {links.map((link) => {
            const active = link.href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`px-3 py-2 rounded-lg text-sm transition-colors ${
                  active ? "bg-signal text-white" : "text-white/70 hover:bg-white/10 hover:text-white"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="px-6 py-6 border-t border-white/10">
        <p className="text-xs text-white/50 truncate">{email}</p>
        <p className="text-xs uppercase tracking-wide text-signal mt-0.5">{role}</p>
        <button onClick={() => signOut({ fetchOptions: { onSuccess: () => router.push("/") } })} className="mt-3 text-sm text-white/70 hover:text-white transition-colors">
          Log out
        </button>
      </div>
    </aside>
  );
}
