import { FilePlus2 } from "lucide-react";
import { cookies } from "next/headers";
import { RssFeedManager } from "@/components/rss-feed-manager";
import { getRssFeeds } from "@/lib/rss-feeds";
import { getWorkspaceSnapshot } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export default async function SourcesPage() {
  const cookieStore = await cookies();
  const [{ brands }, feeds] = await Promise.all([
    getWorkspaceSnapshot(cookieStore.get("active-brand")?.value),
    getRssFeeds(),
  ]);

  return (
    <section className="px-6 py-8 lg:px-10 lg:py-10">
      <div className="mb-6 flex justify-end">
        <a
          href="/inputs/new"
          className="inline-flex items-center gap-2 rounded-xl bg-[var(--sage)] px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
        >
          <FilePlus2 size={16} /> Add source
        </a>
      </div>
      <RssFeedManager brands={brands} feeds={feeds} />
    </section>
  );
}
