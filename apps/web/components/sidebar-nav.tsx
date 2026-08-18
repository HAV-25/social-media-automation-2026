"use client";

import {
  Archive,
  ChartNoAxesCombined,
  ChevronDown,
  History,
  LayoutDashboard,
  Radio,
  Sparkles,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { usePathname } from "next/navigation";
import { useState } from "react";

type NavLink = { label: string; icon: LucideIcon; href: string };
type NavGroup = { label: string; icon: LucideIcon; items: NavLink[] };
type NavEntry = NavLink | NavGroup;

const entries: NavEntry[] = [
  { label: "Content inbox", icon: LayoutDashboard, href: "/" },
  {
    label: "RSS Feed Sources",
    icon: Radio,
    items: [
      { label: "Sources", icon: Radio, href: "/sources" },
      { label: "Runs & errors", icon: TriangleAlert, href: "/runs" },
    ],
  },
  { label: "Ready posts", icon: Sparkles, href: "/posts" },
  {
    label: "Operations",
    icon: ChartNoAxesCombined,
    items: [
      { label: "Performance", icon: ChartNoAxesCombined, href: "/performance" },
      { label: "Activity & feedback", icon: History, href: "/activity" },
      { label: "Archive", icon: Archive, href: "/archive" },
    ],
  },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

function linkClass(active: boolean) {
  return `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
    active ? "bg-white text-[var(--sage)]" : "text-white/65 hover:bg-white/8 hover:text-white"
  }`;
}

function NavLinkItem({ item, pathname }: { item: NavLink; pathname: string }) {
  const active = isActive(pathname, item.href);
  const Icon = item.icon;
  return (
    <a href={item.href} aria-current={active ? "page" : undefined} className={linkClass(active)}>
      <Icon size={18} strokeWidth={1.8} />
      <span className="flex-1">{item.label}</span>
    </a>
  );
}

function NavGroupItem({ group, pathname }: { group: NavGroup; pathname: string }) {
  const hasActiveChild = group.items.some((item) => isActive(pathname, item.href));
  const [open, setOpen] = useState(hasActiveChild);
  const Icon = group.icon;
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-white/65 transition hover:bg-white/8 hover:text-white"
      >
        <Icon size={18} strokeWidth={1.8} />
        <span className="flex-1 text-left">{group.label}</span>
        <ChevronDown size={16} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? (
        <div className="mt-1 ml-4 space-y-1 border-l border-white/10 pl-3">
          {group.items.map((item) => (
            <NavLinkItem key={item.label} item={item} pathname={pathname} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function SidebarNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main navigation" className="mt-7 space-y-1">
      {entries.map((entry) =>
        "items" in entry ? (
          <NavGroupItem key={entry.label} group={entry} pathname={pathname} />
        ) : (
          <NavLinkItem key={entry.label} item={entry} pathname={pathname} />
        ),
      )}
    </nav>
  );
}
