"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import "./profile.css";
import type { ProfileBannerId } from "@/lib/profile/profileBanners";

function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

function shadows(seed: number, n: number, col: string, tile: number) {
  const r = rng(seed);
  const a: string[] = [];
  for (let i = 0; i < n; i++) {
    const x = Math.floor((r() * tile) / 4) * 4;
    const y = Math.floor(r() * 28) * 4;
    for (let k = 0; k < 4; k++) a.push(`${x + tile * k}px ${y}px ${col}`);
  }
  return a.join(",");
}

const CONFETTI_COLORS = ["#ff5ca8", "#ffd23f", "#38d5c8", "#7cb2ff", "#fff"];
const CONFETTI = (() => {
  const r = rng(7);
  return Array.from({ length: 22 }, (_, i) => ({
    left: `${(r() * 100).toFixed(1)}%`,
    background: CONFETTI_COLORS[i % 5],
    animationDuration: `${(3 + r() * 3).toFixed(1)}s`,
    animationDelay: `-${(r() * 5).toFixed(1)}s`,
  })) as CSSProperties[];
})();
const BUBBLES = (() => {
  const r = rng(11);
  return Array.from({ length: 14 }, () => {
    const s = Math.round(8 + r() * 20);
    return {
      left: `${(r() * 96).toFixed(1)}%`,
      width: s,
      height: s,
      animationDuration: `${(4 + r() * 4).toFixed(1)}s`,
      animationDelay: `-${(r() * 6).toFixed(1)}s`,
    } as CSSProperties;
  });
})();
const WINDOWS = (() => {
  const r = rng(5);
  const c = ["", "x", "y"];
  return Array.from({ length: 26 }, (_, i) => ({
    cls: `pf-wd ${c[i % 3] ? "pf-" + c[i % 3] : ""}`,
    x: Math.floor(r() * 370 + 8),
    y: Math.floor(r() * 38 + 86),
  }));
})();
const PX1 = shadows(3, 7, "#fff", 200);
const PX2 = shadows(9, 9, "#7cb2ff", 200);

function Plane({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 42 30">
      <path d="M2 14L40 2 28 28 20 17z" fill="#fff" stroke="#6b7a90" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M20 17L40 2" stroke="#6b7a90" strokeWidth="1.5" />
    </svg>
  );
}

function Scene({ id }: { id: ProfileBannerId }): ReactNode {
  switch (id) {
    case "yildiz":
      return (<><div className="pf-s1" /><div className="pf-s2" /><div className="pf-moon" /><div className="pf-shoot" /></>);
    case "gunbatimi":
      return (<><div className="pf-sun" /><div className="pf-w2" /><div className="pf-w1" /></>);
    case "yagmur":
      return (<><div className="pf-bk" /><div className="pf-r1" /><div className="pf-r2" /></>);
    case "neon":
      return (
        <>
          <svg className="pf-sk" viewBox="0 0 390 132" preserveAspectRatio="xMidYMax slice">
            <path fill="#150b36" d="M0 132V80h30V60h26v28h24V50h30v40h20V70h34v22h26V40h28v50h22V66h30v26h28V56h26v76z" />
            {WINDOWS.map((w, i) => (
              <rect key={i} className={w.cls} x={w.x} y={w.y} width={4} height={5} />
            ))}
          </svg>
          <b className="pf-sign">LİSE</b>
        </>
      );
    case "ucak":
      return (<><div className="pf-c1" /><div className="pf-c2" /><Plane /><Plane className="pf-p2" /></>);
    case "defter":
      return (<><div className="pf-mg" /><div className="pf-dd" /></>);
    case "retro":
      return (<><div className="pf-sun" /><div className="pf-gr" /></>);
    case "konfeti":
      return <>{CONFETTI.map((s, i) => <i key={i} style={s} />)}</>;
    case "kabarcik":
      return <>{BUBBLES.map((s, i) => <i key={i} style={s} />)}</>;
    case "piksel":
      return (
        <>
          <div className="pf-px" style={{ width: 4, height: 4, animationDuration: "6s", animationTimingFunction: "steps(25)", boxShadow: PX1 }} />
          <div className="pf-px" style={{ width: 2, height: 2, animationDuration: "12s", animationTimingFunction: "steps(25)", boxShadow: PX2 }} />
          <div className="pf-hr" /><div className="pf-gd" />
        </>
      );
  }
}

/**
 * Kod ile çizilen hazır banner. Yalnızca ekranda görünürken (IntersectionObserver) animasyon çalışır;
 * still=true ise sabit kare; prefers-reduced-motion CSS ile dondurur.
 */
export default function ProfileBanner({
  id,
  still = false,
  className = "",
  label,
}: {
  id: ProfileBannerId;
  still?: boolean;
  className?: string;
  label?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || still) return;
    if (typeof IntersectionObserver === "undefined") {
      el.classList.add("pf-on");
      return;
    }
    const io = new IntersectionObserver(
      (es) => es.forEach((e) => setOn(e.isIntersecting)),
      { rootMargin: "40px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [still]);

  return (
    <div
      ref={ref}
      className={`pf-bn pf-b-${id} ${on && !still ? "pf-on" : ""} ${still ? "pf-still" : ""} ${className}`}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      data-banner={id}
    >
      <Scene id={id} />
    </div>
  );
}
