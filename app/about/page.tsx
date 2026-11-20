import Link from "next/link";

export default function AboutPage() {
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

      <section className="px-6 sm:px-10 py-16 max-w-3xl mx-auto">
        <h1 className="font-display font-700 text-4xl text-ink">About ProptMate</h1>
        <div className="mt-8 space-y-5 text-slate leading-relaxed">
          <p>
            ProptMate started with a simple frustration: property inspections shouldn't take longer to write up than
            they take to actually do. Letting agents and inventory clerks were spending hours retyping the same
            checklists, wrestling with paper forms, and chasing tenants for signatures on reports that should have
            taken minutes to send.
          </p>
          <p>
            We built ProptMate to fix that — a single place to walk a property, tag every room's condition, capture
            photos on the spot, and ship a professional, branded report before you've even left the driveway. No
            more retyping the same "Bed, Wardrobe, Chest of drawers" for the hundredth bedroom. No more losing a
            signed form in someone's inbox.
          </p>
          <p>
            Today ProptMate is used by independent inventory clerks and small-to-mid-size letting agencies across
            the UK who want inspections that are faster to complete, easier to trust, and simpler to defend if a
            deposit dispute ever comes up.
          </p>
          <p>We're a small, UK-based team, and we're still building. If there's something ProptMate should do that it doesn't yet, we'd genuinely like to hear about it.</p>
        </div>
        <Link href="/contact" className="inline-block mt-8 bg-signal text-white px-6 py-3 rounded-full font-medium hover:opacity-90 transition-opacity">
          Get in touch
        </Link>
      </section>

      <footer className="px-6 sm:px-10 py-10 border-t border-line text-center text-sm text-slate">
        © {new Date().getFullYear()} ProptMate. All rights reserved.
      </footer>
    </main>
  );
}
