export function SectionTitle({
  kicker,
  title,
  description,
}: {
  kicker?: string;
  title: string;
  description?: string;
}) {
  return (
    <header className="mb-4">
      {kicker ? (
        <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
          {kicker}
        </p>
      ) : null}
      <h2 className="text-xl font-semibold tracking-tight text-fg sm:text-2xl">{title}</h2>
      {description ? <p className="mt-1 max-w-3xl text-sm text-muted">{description}</p> : null}
    </header>
  );
}
