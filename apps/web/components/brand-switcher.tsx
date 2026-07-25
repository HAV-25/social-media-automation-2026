"use client";

import { ChevronDown } from "lucide-react";
import type { WorkspaceBrand } from "@/lib/workspace";

export function BrandSwitcher({
  activeBrandId,
  action,
  brands,
}: {
  activeBrandId: string;
  action: (formData: FormData) => Promise<void>;
  brands: WorkspaceBrand[];
}) {
  return (
    <form action={action} className="relative">
      <select
        aria-label="Active brand"
        name="brandId"
        defaultValue={activeBrandId}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
        className="appearance-none rounded-xl border border-white/10 bg-white/8 py-2.5 pr-10 pl-3 text-sm font-semibold text-white outline-none focus:ring-2 focus:ring-white/30"
      >
        {brands.map((brand) => (
          <option key={brand.id} value={brand.id} className="text-black">
            {brand.name}
          </option>
        ))}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-white/60"
        size={16}
      />
    </form>
  );
}
