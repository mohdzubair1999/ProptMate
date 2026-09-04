import type { Metadata, Viewport } from "next";
// Self-hosted fonts via @fontsource rather than next/font/google — the latter needs to fetch
// font files from Google's CDN at every build, which has proven unreliable on some networks
// (genuine, repeated build failures, not a one-off blip). @fontsource bundles the actual
// .woff2 files inside the npm package itself, so they're installed with everything else via
// npm install and never need a live network request at build time.
import "@fontsource/space-grotesk/500.css";
import "@fontsource/space-grotesk/600.css";
import "@fontsource/space-grotesk/700.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import ServiceWorkerRegistration from "@/components/ServiceWorkerRegistration";
import "./globals.css";

export const metadata: Metadata = {
  // Required for Next.js to resolve the relative OG image path below into a full URL.
  metadataBase: new URL("https://proptmate.zkmholdingslimited.com"),
  title: "ProptMate — The Smarter Property Companion",
  description: "Automated inspections, reporting, and maintenance workflows for letting agents and property managers.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "ProptMate",
  },
  openGraph: {
    title: "ProptMate — The Smarter Property Companion",
    description: "Automated inspections, reporting, and maintenance workflows for letting agents and property managers.",
    url: "https://proptmate.zkmholdingslimited.com",
    siteName: "ProptMate",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "ProptMate" }],
    locale: "en_GB",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "ProptMate — The Smarter Property Companion",
    description: "Automated inspections, reporting, and maintenance workflows for letting agents and property managers.",
    images: ["/og-image.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#D96B44",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-body antialiased">
        <ServiceWorkerRegistration />
        {children}
      </body>
    </html>
  );
}
