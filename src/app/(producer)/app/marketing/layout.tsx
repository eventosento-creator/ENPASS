import { requireEventsSpace } from "@/modules/organizations/application/space-guard";

export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireEventsSpace();
  return children;
}
