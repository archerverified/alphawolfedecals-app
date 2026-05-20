// Shared status pill for template + request statuses.

const STYLES: Record<string, string> = {
  draft: 'bg-zinc-100 text-zinc-700',
  review: 'bg-amber-100 text-amber-800',
  published: 'bg-emerald-100 text-emerald-800',
  retired: 'bg-zinc-200 text-zinc-500',
  pending: 'bg-amber-100 text-amber-800',
  in_progress: 'bg-blue-100 text-blue-800',
  shipped: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-red-100 text-red-800',
};

const LABELS: Record<string, string> = {
  in_progress: 'In progress',
};

export function StatusBadge({ status }: { status: string }) {
  const label = LABELS[status] ?? status.charAt(0).toUpperCase() + status.slice(1);
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STYLES[status] ?? 'bg-zinc-100 text-zinc-700'}`}
    >
      {label}
    </span>
  );
}
