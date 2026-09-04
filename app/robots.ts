import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // These require a login and have nothing useful to show a crawler anyway — no point
      // letting search engines waste time trying to index pages they can't actually see.
      disallow: ["/dashboard", "/portal", "/api", "/forgot-password", "/reset-password"],
    },
    sitemap: "https://proptmate.zkmholdingslimited.com/sitemap.xml",
  };
}
