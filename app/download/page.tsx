import Link from "next/link";
import InstallAppButton from "@/components/InstallAppButton";

export default function DownloadPage() {
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
        <h1 className="font-display font-700 text-4xl text-ink">Download ProptMate</h1>
        <p className="mt-4 text-slate">Get ProptMate on any device — pick your platform below for the right way to install it.</p>

        <InstallAppButton variant="card" hideIosCard />

        <div className="mt-6 space-y-6">
          {/* Android */}
          <div className="bg-white border border-line rounded-xl p-6">
            <div className="flex items-start gap-4">
              <div className="w-11 h-11 rounded-lg bg-verified/10 text-verified flex items-center justify-center shrink-0">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="5" y="2" width="14" height="20" rx="2" />
                  <path d="M12 18h.01" />
                </svg>
              </div>
              <div className="flex-1">
                <h2 className="font-display font-600 text-lg text-ink">Android</h2>
                <p className="text-sm text-slate mt-1">A real, installable app — download it directly, no Play Store needed.</p>
                <ol className="mt-4 space-y-2 text-sm text-slate list-decimal list-inside">
                  <li>Tap the download button below on your Android phone</li>
                  <li>Open the downloaded file — if you see a warning about "unknown apps," tap <strong>Settings</strong> and allow installs from your browser, then try again</li>
                  <li>Tap <strong>Install</strong>, then <strong>Open</strong></li>
                </ol>
                <a href="/downloads/proptmate.apk" download className="inline-block mt-4 bg-signal text-white px-5 py-2.5 rounded-full text-sm font-medium hover:opacity-90 transition-opacity">
                  Download for Android
                </a>
              </div>
            </div>
          </div>

          {/* Mac */}
          <div className="bg-white border border-line rounded-xl p-6">
            <div className="flex items-start gap-4">
              <div className="w-11 h-11 rounded-lg bg-signal/10 text-signal flex items-center justify-center shrink-0">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="13" rx="1" />
                  <path d="M8 21h8M12 17v4" />
                </svg>
              </div>
              <div className="flex-1">
                <h2 className="font-display font-600 text-lg text-ink">Mac</h2>
                <p className="text-sm text-slate mt-1">A native desktop app with its own Dock icon and menu bar.</p>
                <ol className="mt-4 space-y-2 text-sm text-slate list-decimal list-inside">
                  <li>Download the .dmg below and open it</li>
                  <li>Drag <strong>ProptMate</strong> into the <strong>Applications</strong> folder shown</li>
                  <li>
                    Open <strong>Applications</strong>, <strong>right-click ProptMate</strong> and choose <strong>Open</strong> (not a regular double-click) — this is only needed the first time, since the app isn't yet
                    registered with an Apple Developer certificate
                  </li>
                  <li>Click <strong>Open</strong> on the warning that appears</li>
                </ol>
                <a
                  href="https://bpfa6xru0g01mlzx.public.blob.vercel-storage.com/downloads/ProptMate.dmg"
                  download
                  className="inline-block mt-4 bg-signal text-white px-5 py-2.5 rounded-full text-sm font-medium hover:opacity-90 transition-opacity"
                >
                  Download for Mac
                </a>
              </div>
            </div>
          </div>

          {/* iPhone/iPad */}
          <div className="bg-white border border-line rounded-xl p-6">
            <div className="flex items-start gap-4">
              <div className="w-11 h-11 rounded-lg bg-ink/10 text-ink flex items-center justify-center shrink-0">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="6" y="2" width="12" height="20" rx="2" />
                  <path d="M12 18h.01" />
                </svg>
              </div>
              <div className="flex-1">
                <h2 className="font-display font-600 text-lg text-ink">iPhone &amp; iPad</h2>
                <p className="text-sm text-slate mt-1">Apple doesn't allow apps to be installed outside the App Store the way Android does, so this is the real, supported way to get ProptMate onto your home screen.</p>
                <ol className="mt-4 space-y-2 text-sm text-slate list-decimal list-inside">
                  <li>
                    Open <strong>proptmate.zkmholdingslimited.com</strong> in <strong>Safari</strong> (this must be Safari specifically — it won't work in Chrome on iOS)
                  </li>
                  <li>
                    Tap the <strong>Share</strong> button (the square with an arrow pointing up)
                  </li>
                  <li>
                    Scroll down and tap <strong>Add to Home Screen</strong>
                  </li>
                  <li>Tap <strong>Add</strong> — ProptMate now opens full-screen from your home screen, just like any other app</li>
                </ol>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="px-6 sm:px-10 py-10 border-t border-line text-center text-sm text-slate">
        © {new Date().getFullYear()} ProptMate. All rights reserved.
      </footer>
    </main>
  );
}
