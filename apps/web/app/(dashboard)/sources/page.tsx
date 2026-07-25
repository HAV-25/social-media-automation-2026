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
      <RssFeedManager brands={brands} feeds={feeds} />
    </section>
  );
}
