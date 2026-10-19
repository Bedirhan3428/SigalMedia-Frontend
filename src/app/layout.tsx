import type { Metadata, Viewport } from "next";
// [START] CyberCore
import { Suspense } from "react";
// [END] CyberCore
import localFont from "next/font/local";
import { AuthProvider } from "@/context/AuthContext";
import BackgroundAudioGuard from "@/components/common/BackgroundAudioGuard";
import "./globals.css";

const googleSans = localFont({
  src: [
    {
      path: "../fonts/GoogleSans-VariableFont_GRAD,opsz,wght.ttf",
      style: "normal",
    },
    {
      path: "../fonts/GoogleSans-Italic-VariableFont_GRAD,opsz,wght.ttf",
      style: "italic",
    },
  ],
  variable: "--font-google-sans",
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: "SigalMedia",
  description: "Yeni nesil modern, hızlı ve bağlantıda tutan sosyal medya platformu.",
  manifest: "/manifest.json",
  icons: {
    icon: "/icons/MainLogo.svg",
    apple: "/icons/MainLogo.svg",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "SigalMedia",
  },
  other: {
    "darkreader-lock": "",
    "mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  colorScheme: "dark",
  themeColor: "#000000",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="tr"
      className={`${googleSans.variable} font-sans h-full antialiased dark`}
      suppressHydrationWarning
    >
      <head>
        <meta name="darkreader-lock" content="" />
        <meta name="color-scheme" content="dark" />
        <link rel="apple-touch-icon" href="/icons/MainLogo.svg" />
      </head>
      <body
        className="min-h-full flex flex-col bg-zinc-950 text-zinc-100 selection:bg-emerald-500/20 selection:text-emerald-300"
        suppressHydrationWarning
      >
        <BackgroundAudioGuard />
        {/* [START] CyberCore */}
        <Suspense fallback={null}>
          <AuthProvider>{children}</AuthProvider>
        </Suspense>
        {/* [END] CyberCore */}
      </body>
    </html>
  );
}
