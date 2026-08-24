export function ActionMessage({ message, tone = "error" }: { message?: string; tone?: "error" | "success" }) {
  if (!message) return null;
  return <p role="status" className={`rounded-xl p-3 text-sm ${tone === "success" ? "status-success" : "status-danger"}`}>{message}</p>;
}
