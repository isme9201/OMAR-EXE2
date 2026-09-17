import { AvenmediaAuthGate } from "@/components/AvenmediaAuthGate";
import { WORKSPACE_PAGES, type WorkspacePage } from "@/lib/workspaces";

export const dynamicParams = false;
export function generateStaticParams() {
  return WORKSPACE_PAGES.filter((page) => page !== "overview").map((section) => ({ section }));
}
export default async function SectionPage({ params }: { params: Promise<{ section: WorkspacePage }> }) {
  const { section } = await params;
  return <AvenmediaAuthGate page={section} />;
}
