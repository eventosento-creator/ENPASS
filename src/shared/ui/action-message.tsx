export function ActionMessage({ message }: { message?: string }) {
  if (!message) return null;
  return <p role="status" className="rounded-xl border border-red-900/50 bg-red-950/30 p-3 text-sm text-red-200">{message}</p>;
}
