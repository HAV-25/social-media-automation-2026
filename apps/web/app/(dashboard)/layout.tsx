import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { getCurrentUser } from "@/lib/auth";
import { getWorkspaceSnapshot } from "@/lib/workspace";
import { signOut, switchBrand } from "./actions";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  const cookieStore = await cookies();
  const snapshot = await getWorkspaceSnapshot(cookieStore.get("active-brand")?.value);

  return (
    <main className="min-h-screen">
      <Sidebar
        activeBrandId={snapshot.activeBrand.id}
        brands={snapshot.brands}
        role={user.role}
        signOut={signOut}
        switchBrand={switchBrand}
        userName={user.displayName}
      />
      <div className="lg:ml-72">{children}</div>
    </main>
  );
}
