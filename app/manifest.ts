import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ProptMate — Property Inspections",
    short_name: "ProptMate",
    id: "/dashboard",
    description: "Property inventory and inspection reports, built for letting agents and inspectors.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#FBF8F4",
    theme_color: "#D96B44",
    orientation: "portrait-primary",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
