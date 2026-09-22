import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = "https://proptmate.zkmholdingslimited.com";

  // Only public, unauthenticated pages belong here — dashboard/portal pages require login
  // and shouldn't be indexed or crawled at all.
  const routes = ["", "/about", "/contact", "/download", "/privacy", "/terms", "/cookies", "/login", "/signup"];

  return routes.map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: new Date(),
    changeFrequency: route === "" ? "weekly" : "monthly",
    priority: route === "" ? 1 : 0.6,
  }));
}
