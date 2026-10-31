"use client";

import { useRouter } from "next/navigation";
import { signOut } from "@/lib/auth-client";
import { clearSessionHint } from "@/lib/sessionHint";

export default function PortalSignOut() {
  const router = useRouter();
  return (
    <button
      onClick={() => signOut({ fetchOptions: { onSuccess: () => { clearSessionHint(); router.push("/"); } } })}
      className="text-sm text-slate hover:text-ink transition-colors"
    >
      Log out
    </button>
  );
}
