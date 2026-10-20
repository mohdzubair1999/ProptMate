import type { Metadata } from "next";
import Link from "next/link";
import HelpContent from "@/app/help/help-content";

export const metadata: Metadata = { title: "Help & Tutorials" };

// The same videos and guide as the public Help page, shown inside the dashboard so the sidebar stays.
export default function SettingsHelpPage() {
  return (
    <main className="max-w-4xl">
      <Link href="/dashboard/settings" className="text-sm text-slate hover:text-ink">
        ← Back to settings
      </Link>
      <div className="mt-4">
        <HelpContent title="Help & Tutorials" />
      </div>
    </main>
  );
}
