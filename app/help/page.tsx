import type { Metadata } from "next";
import Link from "next/link";
import HelpContent, { VIDEO_JSON_LD } from "./help-content";

export const metadata: Metadata = {
  title: "How to use ProptMate: video tutorial and guide",
  description:
    "Learn ProptMate in minutes: draw floor plans with furniture, walls and labels, add your logo, share plans by link, and amend completed inspections. Video walkthrough and step-by-step guide.",
  alternates: { canonical: "/help" },
  openGraph: { title: "How to use ProptMate", description: "Video walkthrough and step-by-step guide to ProptMate floor plans, logo, sharing and amending inspections.", url: "/help", type: "website", images: ["/og-image.png"] },
};

export default function HelpPage() {
  return (
    <main className="min-h-screen bg-paper">
      <nav className="flex items-center justify-between px-6 sm:px-10 py-6">
        <Link href="/" className="font-display font-700 text-lg tracking-tight text-ink">
          ProptMate
        </Link>
        <div className="flex items-center gap-3">
          <Link href="/login" className="text-sm text-slate hover:text-ink transition-colors">
            Log in
          </Link>
          <Link href="/signup" className="text-sm bg-ink text-white px-4 py-2 rounded-full hover:bg-signal transition-colors">
            Get started free
          </Link>
        </div>
      </nav>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(VIDEO_JSON_LD).replace(/</g, "\\u003c") }} />

      <div className="px-6 sm:px-10 py-10 max-w-4xl mx-auto">
        <HelpContent title="How to use ProptMate" />
      </div>

      <footer className="px-6 sm:px-10 py-10 border-t border-line text-center text-sm text-slate">
        © {new Date().getFullYear()} ProptMate. All rights reserved.
      </footer>
    </main>
  );
}
