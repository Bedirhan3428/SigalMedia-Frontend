"use client";

import { useEffect } from "react";
import { SITE_NAME } from "@/lib/config/site";

/** İstemci sayfaları için sekme başlığı: "<başlık> · Shovrum". */
export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = `${title} · ${SITE_NAME}`;
  }, [title]);
}
