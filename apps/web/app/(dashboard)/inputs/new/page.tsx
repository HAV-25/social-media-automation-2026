import { cookies } from "next/headers";
import { ManualInputForm } from "@/components/manual-input-form";
import { OneOffInputForm } from "@/components/one-off-input-form";
import { SourceFileUploadForm } from "@/components/source-file-upload-form";
import { getWorkspaceSnapshot } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export default async function NewInputPage() {
  const cookieStore = await cookies();
  const { activeBrand, brands } = await getWorkspaceSnapshot(
    cookieStore.get("active-brand")?.value,
  );

  return (
    <section className="space-y-8 px-6 py-8 lg:px-10 lg:py-10">
      <ManualInputForm activeBrandId={activeBrand.id} brands={brands} />
      <OneOffInputForm activeBrandId={activeBrand.id} brands={brands} />
      <SourceFileUploadForm activeBrandId={activeBrand.id} brands={brands} />
    </section>
  );
}
