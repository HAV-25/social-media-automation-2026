"use client";

import {
  Archive,
  BookOpenText,
  FilePlus2,
  LayoutDashboard,
  Radio,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { usePathname } from "next/navigation";

const available = [
  { label: "Content inbox", icon: LayoutDashboard, href: "/" },
  { label: "Add source", icon: FilePlus2, href: "/inputs/new" },
  { label: "Sources", icon: Radio, href: "/sources" },
  { label: "Runs & errors", icon: TriangleAlert, href: "/runs" },
  { label: "Ready posts", icon: Sparkles, href: "/posts" },
  { label: "Archive", icon: Archive, href: "/archive" },
];

const upcoming = [{ label: "Styles", icon: BookOpenText }];

export function SidebarNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main navigation" className="mt-7 space-y-1">
      {available.map(({ label, icon: Icon, href }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <a
            key={label}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
              active
                ? "bg-white text-[var(--sage)]"
                : "text-white/65 hover:bg-white/8 hover:text-white"
            }`}
          >
            <Icon size={18} strokeWidth={1.8} />
            <span className="flex-1">{label}</span>
          </a>
        );
      })}
      {upcoming.map(({ label, icon: Icon }) => (
        <span
          key={label}
          aria-disabled="true"
          className="flex cursor-not-allowed items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-white/30"
        >
          <Icon size={18} strokeWidth={1.8} />
          <span className="flex-1">{label}</span>
          <span className="text-[9px] font-bold tracking-wide uppercase">Next</span>
        </span>
      ))}
    </nav>
  );
}
