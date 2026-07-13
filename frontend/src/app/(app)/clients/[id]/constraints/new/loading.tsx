export default function Loading() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div className="h-4 w-32 animate-pulse rounded bg-muted" />
      <div className="h-8 w-48 animate-pulse rounded bg-muted" />
      <div className="flex flex-col gap-4 rounded-card border border-border bg-card p-6">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-10 w-full animate-pulse rounded bg-muted" />
        ))}
      </div>
    </div>
  );
}
