import type { Metadata, Viewport } from "next";
import { Space_Grotesk, Inter } from "next/font/google";
import ServiceWorkerRegistration from "@/components/ServiceWorkerRegistration";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  weight: ["500", "600", "700"],
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "ProptMate — The Smarter Property Companion",
  description: "Automated inspections, reporting, and maintenance workflows for letting agents and property managers.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "ProptMate",
  },
};

export const viewport: Viewport = {
  themeColor: "#D96B44",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${inter.variable}`}>
      <body className="font-body antialiased">
        <ServiceWorkerRegistration />
        {children}
      </body>
    </html>
  );
}
