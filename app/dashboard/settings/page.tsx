import Link from "next/link";
import InstallAppButton from "@/components/InstallAppButton";

export default function SettingsPage() {
  return (
    <main>
      <h1 className="font-display font-700 text-2xl text-ink">Settings</h1>

      <div className="mt-8 grid sm:grid-cols-2 gap-4">
        <Link href="/dashboard/settings/templates" className="bg-white border border-line rounded-xl p-6 hover:border-ink transition-colors">
          <h2 className="font-display font-600 text-lg text-ink">Report templates</h2>
          <p className="text-sm text-slate mt-1">Build the sections and fields inspectors see for each inspection type.</p>
        </Link>

        <Link href="/dashboard/settings/team" className="bg-white border border-line rounded-xl p-6 hover:border-ink transition-colors">
          <h2 className="font-display font-600 text-lg text-ink">Team</h2>
          <p className="text-sm text-slate mt-1">Add or remove team members and manage their roles.</p>
        </Link>

        <Link href="/dashboard/settings/billing" className="bg-white border border-line rounded-xl p-6 hover:border-ink transition-colors">
          <h2 className="font-display font-600 text-lg text-ink">Billing</h2>
          <p className="text-sm text-slate mt-1">Manage your plan, payment method, and invoices.</p>
        </Link>

        <InstallAppButton variant="card" />

        <a href="/downloads/proptmate.apk" download className="bg-white border border-line rounded-xl p-6 hover:border-ink transition-colors">
          <h2 className="font-display font-600 text-lg text-ink">Download for Android</h2>
          <p className="text-sm text-slate mt-1">Direct .apk download — install it straight on your Android phone.</p>
        </a>

        <a href="https://bpfa6xru0g01mlzx.public.blob.vercel-storage.com/downloads/ProptMate.dmg" download className="bg-white border border-line rounded-xl p-6 hover:border-ink transition-colors">
          <h2 className="font-display font-600 text-lg text-ink">Download for Mac</h2>
          <p className="text-sm text-slate mt-1">Native desktop app — a real, standalone Mac application.</p>
        </a>
      </div>

      <h2 className="font-display font-600 text-sm text-slate uppercase tracking-wide mt-10">Company & legal</h2>
      <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Link href="/about" className="bg-white border border-line rounded-xl p-5 hover:border-ink transition-colors">
          <h2 className="font-display font-600 text-ink">About</h2>
        </Link>
        <Link href="/contact" className="bg-white border border-line rounded-xl p-5 hover:border-ink transition-colors">
          <h2 className="font-display font-600 text-ink">Contact</h2>
        </Link>
        <Link href="/privacy" className="bg-white border border-line rounded-xl p-5 hover:border-ink transition-colors">
          <h2 className="font-display font-600 text-ink">Privacy Policy</h2>
        </Link>
        <Link href="/terms" className="bg-white border border-line rounded-xl p-5 hover:border-ink transition-colors">
          <h2 className="font-display font-600 text-ink">Terms of Service</h2>
        </Link>
        <Link href="/cookies" className="bg-white border border-line rounded-xl p-5 hover:border-ink transition-colors">
          <h2 className="font-display font-600 text-ink">Cookie Policy</h2>
        </Link>
      </div>
    </main>
  );
}
