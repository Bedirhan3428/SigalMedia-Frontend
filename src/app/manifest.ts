import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SigalMedia",
    short_name: "SigalMedia",
    description: "Yeni nesil modern, hızlı ve bağlantıda tutan sosyal medya platformu.",
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
