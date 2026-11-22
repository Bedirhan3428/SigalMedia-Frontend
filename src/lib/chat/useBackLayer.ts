"use client";

import { useEffect, useRef } from "react";

/**
 * Tarayıcı/Android Geri tuşunu açık bir katmana (sheet, menü) bağlar.
 * active=true olunca tek bir geçmiş girdisi eklenir; Geri bu girdiyi çıkarınca onBack çağrılır.
 * onBack true dönerse katman açık kalır (örn. alt sayfadan ana listeye) ve girdi yeniden eklenir.
 * Katman arayüzden (X, Escape, dış tık) kapanırsa girdi history.back() ile temizlenir.
 */
export function useBackLayer(active: boolean, onBack: () => boolean | void) {
  const cb = useRef(onBack);
  useEffect(() => {
    cb.current = onBack;
  });

  useEffect(() => {
    if (!active || typeof window === "undefined") return;
    const MARK = "__chatLayer";
    let live = true; // girdi hâlâ yığında mı
    let ignoreNext = false;
    const push = () => window.history.pushState({ ...(window.history.state || {}), [MARK]: true }, "");
    push();
    const onPop = () => {
      if (ignoreNext) {
        ignoreNext = false;
        return;
      }
      if (!live) return;
      const stay = cb.current();
      if (stay === true) push();
      else live = false;
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      if (live && window.history.state && window.history.state[MARK]) {
        ignoreNext = false;
        window.history.back();
      }
    };
  }, [active]);
}
