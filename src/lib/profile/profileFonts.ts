import { Caveat, Archivo_Black } from "next/font/google";

// preload kapalı: yazı tipi yalnızca ilgili tema sınıfı uygulanınca indirilir.
const caveat = Caveat({
  subsets: ["latin", "latin-ext"],
  weight: ["600", "700"],
  variable: "--pf-caveat",
  display: "swap",
  preload: false,
});
const archivo = Archivo_Black({
  subsets: ["latin", "latin-ext"],
  weight: "400",
  variable: "--pf-archivo",
  display: "swap",
  preload: false,
});

export function themeFontClass(theme: string): string {
  if (theme === "defter") return caveat.variable;
  if (theme === "dolap") return archivo.variable;
  return "";
}
