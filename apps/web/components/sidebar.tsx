import { CircleUserRound, LogOut, Settings2 } from "lucide-react";
import type { WorkspaceBrand } from "@/lib/workspace";
import { BrandSwitcher } from "./brand-switcher";
import { SidebarNav } from "./sidebar-nav";

export function Sidebar({
  activeBrandId,
  brands,
  role,
  signOut,
  switchBrand,
  userName,
}: {
  activeBrandId: string;
  brands: WorkspaceBrand[];
  role: string;
  signOut: () => Promise<void>;
  switchBrand: (formData: FormData) => Promise<void>;
  userName: string;
}) {
  return (
    <aside className="flex min-h-screen w-full flex-col bg-[var(--sage)] p-5 text-white lg:fixed lg:inset-y-0 lg:w-72">
      <div className="flex items-center gap-3 px-2 py-2">
        <span className="grid size-9 place-items-center rounded-full border border-white/25 font-bold">
          E
        </span>
        <div>
          <p className="text-sm font-bold tracking-[0.12em] uppercase">Editorial Desk</p>
          <p className="text-xs text-white/50">AI Social Content Engine</p>
        </div>
      </div>

      <div className="mt-7 rounded-2xl border border-white/10 bg-black/10 p-3">
        <p className="mb-2 text-[10px] font-bold tracking-[0.16em] text-white/45 uppercase">
          Working brand
        </p>
        <BrandSwitcher activeBrandId={activeBrandId} action={switchBrand} brands={brands} />
      </div>

      <SidebarNav />

      <div className="mt-auto border-t border-white/10 pt-4">
        <a
          href="/settings"
          className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-white/60 transition hover:bg-white/8 hover:text-white"
        >
          <Settings2 size={18} /> Settings
        </a>
        <div className="mt-2 flex items-center gap-3 px-3 py-3">
          <CircleUserRound size={30} className="text-white/70" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{userName}</p>
            <p className="text-xs text-white/45 capitalize">{role}</p>
          </div>
        </div>
        <form action={signOut}>
          <button className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-white/55 transition hover:bg-white/8 hover:text-white">
            <LogOut size={17} /> Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
