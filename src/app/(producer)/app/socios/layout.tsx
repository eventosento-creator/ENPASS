import { requireClubPanel } from "@/modules/organizations/application/space-guard";

export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireClubPanel();
  return children;
}
