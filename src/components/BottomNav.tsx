"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Search, Send, SquarePlay, User } from "lucide-react";

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV_ITEMS: NavItem[] = [
  { name: "Ana Sayfa", href: "/", icon: Home },
  { name: "Reels", href: "/reels", icon: SquarePlay },
  { name: "Mesajlar", href: "/messages", icon: Send },
  { name: "Keşfet", href: "/explore", icon: Search },
  { name: "Profil", href: "/profile", icon: User },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      onContextMenu={(e) => e.preventDefault()}
      className="fixed bottom-0 left-0 right-0 z-50 bg-zinc-950/95 border-t border-zinc-900 backdrop-blur-xl pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))] select-none no-select"
    >
      <div className="max-w-md mx-auto h-14 px-3 flex items-center justify-around">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              draggable={false}
              onContextMenu={(e) => e.preventDefault()}
              aria-label={item.name}
              title={item.name}
              className={`flex items-center justify-center flex-1 h-full py-2 transition-all btn-press-subtle no-select ${
                isActive ? "text-white" : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <Icon
                className={`w-6 h-6 transition-transform ${
                  isActive ? "scale-110 stroke-[2.25]" : "stroke-[1.75]"
                }`}
              />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
