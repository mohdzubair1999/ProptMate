import Link from "next/link";

const checklist = [
  { n: "01", label: "Walk the property", detail: "Room by room, offline-capable, on any device." },
  { n: "02", label: "Tag the condition", detail: "Photos, notes, and severity captured in seconds." },
  { n: "03", label: "Ship the report", detail: "Branded PDF, signed and sent before you're back at the car." },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-paper">
      <nav className="flex items-center justify-between px-6 sm:px-10 py-6">
        <span className="font-display font-700 text-lg tracking-tight text-ink">ProptMate</span>
        <div className="flex items-center gap-3">
          <Link href="/login" className="text-sm text-slate hover:text-ink transition-colors">
            Log in
          </Link>
          <Link href="/signup" className="text-sm bg-ink text-white px-4 py-2 rounded-full hover:bg-signal transition-colors">
            Get started free
          </Link>
        </div>
      </nav>

      <section className="relative px-6 sm:px-10 pt-16 pb-16 max-w-5xl mx-auto text-center overflow-hidden">
        <div
          className="absolute -top-24 left-1/2 -translate-x-1/2 w-[560px] h-[560px] rounded-full opacity-40 blur-3xl pointer-events-none"
          style={{ background: "radial-gradient(circle, #D96B44 0%, transparent 70%)" }}
        />
        <div className="relative">
          <span className="inline-block text-xs font-medium tracking-wide text-signal bg-signal/10 rounded-full px-3 py-1.5 mb-6">
            Built for letting agents &amp; inventory clerks
          </span>
          <h1 className="font-display font-700 text-4xl sm:text-6xl leading-[1.05] text-ink max-w-3xl mx-auto">
            The smarter property companion.
          </h1>
          <p className="mt-6 text-lg text-slate max-w-xl mx-auto">
            Walk the property, tag every room, and ship a branded PDF before you've left the driveway. AI-assisted
            reporting, offline-first, fully auditable.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Link href="/signup" className="bg-signal text-white px-6 py-3 rounded-full font-medium hover:opacity-90 transition-opacity shadow-sm">
              Get started free
            </Link>
            <Link href="/login" className="border border-line text-ink px-6 py-3 rounded-full font-medium hover:border-ink transition-colors">
              Log in
            </Link>
          </div>
        </div>
      </section>

      <section className="px-6 sm:px-10 pb-24 max-w-5xl mx-auto">
        <div className="grid sm:grid-cols-3 gap-px bg-line rounded-3xl overflow-hidden shadow-sm">
          {checklist.map((step) => (
            <div key={step.n} className="bg-white p-6 sm:p-8">
              <span className="font-display text-signal text-sm tracking-widest">{step.n}</span>
              <h3 className="font-display font-600 text-lg text-ink mt-3">{step.label}</h3>
              <p className="text-sm text-slate mt-2">{step.detail}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="px-6 sm:px-10 py-10 border-t border-line">
        <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-slate">
          <Link href="/download" className="hover:text-ink transition-colors">Download</Link>
          <Link href="/about" className="hover:text-ink transition-colors">About</Link>
          <Link href="/contact" className="hover:text-ink transition-colors">Contact</Link>
          <Link href="/privacy" className="hover:text-ink transition-colors">Privacy Policy</Link>
          <Link href="/terms" className="hover:text-ink transition-colors">Terms of Service</Link>
          <Link href="/cookies" className="hover:text-ink transition-colors">Cookie Policy</Link>
        </div>
        <p className="text-center text-sm text-slate mt-6">© {new Date().getFullYear()} ProptMate. All rights reserved.</p>
      </footer>
    </main>
  );
}
