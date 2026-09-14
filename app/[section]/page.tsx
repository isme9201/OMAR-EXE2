/* Editorial Atelier design reminder: direct routes open real contextual workspaces while preserving the shared production desk. */
import { DashboardApp } from "@/components/DashboardApp";
import { WORKSPACE_PAGES, type WorkspacePage } from "@/lib/workspaces";

export const dynamicParams = false;

export function generateStaticParams() {
  return WORKSPACE_PAGES.filter((page) => page !== "overview").map((section) => ({ section }));
}

export default async function SectionPage({ params }: { params: Promise<{ section: WorkspacePage }> }) {
  const { section } = await params;
  return <DashboardApp page={section} />;
}
