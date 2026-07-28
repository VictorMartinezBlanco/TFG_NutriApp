export default function Loading() {
  return (
    <div className="flex animate-pulse flex-col gap-6">
      <div className="h-8 w-48 rounded bg-muted" />
      <div className="flex flex-col gap-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-24 rounded-card bg-muted" />
        ))}
      </div>
    </div>
  );
}
