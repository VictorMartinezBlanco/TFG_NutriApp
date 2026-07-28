export default function Loading() {
  return (
    <div className="flex animate-pulse flex-col gap-6">
      <div className="h-8 w-40 rounded bg-muted" />
      <div className="h-[70vh] rounded-card bg-muted" />
    </div>
  );
}
