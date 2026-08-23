import { redirect } from "next/navigation";

export default async function PaymentReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string; result?: string }>;
}) {
  const { order, result } = await searchParams;
  if (!order || !/^[0-9a-f]{32}$/.test(order)) redirect("/");
  const safeResult = new Set(["success", "pending", "failure"]).has(result ?? "") ? result : "pending";
  redirect(`/order/${order}?returned=${safeResult}`);
}
