import Link from "next/link";
import ContactForm from "./contact-form";

export default function ContactPage() {
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

      <section className="px-6 sm:px-10 py-16 max-w-xl mx-auto">
        <h1 className="font-display font-700 text-4xl text-ink">Get in touch</h1>
        <p className="mt-4 text-slate">
          Question about a feature, need help with your account, or just want to say hello — send us a message and
          we'll get back to you.
        </p>
        <div className="mt-8">
          <ContactForm />
        </div>
      </section>

      <footer className="px-6 sm:px-10 py-10 border-t border-line text-center text-sm text-slate">
        © {new Date().getFullYear()} ProptMate. All rights reserved.
      </footer>
    </main>
  );
}
