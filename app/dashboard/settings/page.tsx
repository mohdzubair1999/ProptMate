import Link from "next/link";

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

        <Link href="/dashboard/settings/account" className="bg-white border border-line rounded-xl p-6 hover:border-ink transition-colors">
          <h2 className="font-display font-600 text-lg text-ink">Account</h2>
          <p className="text-sm text-slate mt-1">Export your data, or delete your account.</p>
        </Link>

        <Link href="/dashboard/settings/audit-log" className="bg-white border border-line rounded-xl p-6 hover:border-ink transition-colors">
          <h2 className="font-display font-600 text-lg text-ink">Audit log</h2>
          <p className="text-sm text-slate mt-1">Who changed what, when — across properties, inspections, and compliance.</p>
        </Link>

        <Link href="/download" className="bg-white border border-line rounded-xl p-6 hover:border-ink transition-colors">
          <h2 className="font-display font-600 text-lg text-ink">Download ProptMate</h2>
          <p className="text-sm text-slate mt-1">Get the app on Android, Mac, or iPhone/iPad — with clear instructions for each.</p>
        </Link>
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
