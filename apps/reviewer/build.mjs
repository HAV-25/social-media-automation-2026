import { build } from "vite";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import process from "node:process";

/* global console */

const root = dirname(fileURLToPath(import.meta.url));
const url = process.env.VITE_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const key =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  "";

if (!url || !key) {
  console.warn("Reviewer build has no Supabase configuration; sign-in will show setup guidance.");
}

await build({
  root,
  define: {
    __SUPABASE_URL__: JSON.stringify(url),
    __SUPABASE_PUBLISHABLE_KEY__: JSON.stringify(key),
  },
  build: { outDir: "dist", emptyOutDir: true, sourcemap: true, target: "es2022" },
});
