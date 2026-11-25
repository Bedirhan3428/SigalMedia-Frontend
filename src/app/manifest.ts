import type { MetadataRoute } from "next";
import { SITE_NAME, SITE_DESCRIPTION } from "@/lib/config/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_NAME,
    short_name: SITE_NAME,
    description: SITE_DESCRIPTION,
    start_url: "/",
    id: "/",
    scope: "/",
    display: "standalone",
    display_override: ["window-controls-overlay", "standalone", "minimal-ui"],
    background_color: "#000000",
    theme_color: "#000000",
    orientation: "portrait-primary",
    categories: ["social", "entertainment", "lifestyle"],
    lang: "tr-TR",
    dir: "ltr",
    prefer_related_applications: false,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icons/MainLogo.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icons/MainLogo.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
      {
        src: "/icons/MainLogo.svg",
        sizes: "192x192",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icons/MainLogo.svg",
        sizes: "512x512",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
    shortcuts: [
      {
        name: "Akış",
        short_name: "Akış",
        description: "Ana sayfa akışını görüntüleyin",
        url: "/",
        icons: [{ src: "/icons/MainLogo.svg", sizes: "any" }],
      },
      {
        name: "Keşfet",
        short_name: "Keşfet",
        description: "Popüler ve yeni paylaşımları keşfedin",
        url: "/explore",
        icons: [{ src: "/icons/MainLogo.svg", sizes: "any" }],
      },
      {
        name: "Profilim",
        short_name: "Profil",
        description: "Kendi profilinizi ve gönderilerinizi inceleyin",
        url: "/profile",
        icons: [{ src: "/icons/MainLogo.svg", sizes: "any" }],
      },
    ],
  };
}
