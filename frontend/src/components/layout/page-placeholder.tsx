export function PagePlaceholder({
  title,
  note,
}: {
  title: string;
  note: string;
}) {
  return (
    <div>
      <h1 className="text-2xl font-bold">{title}</h1>
      <div className="mt-6 flex h-64 items-center justify-center rounded-card border border-dashed border-border bg-card text-sm text-muted-foreground">
        {note}
      </div>
    </div>
  );
}
